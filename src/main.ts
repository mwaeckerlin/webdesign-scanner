/** One-shot entry point.
 *
 * Renders the target page in every configured viewport and paper format and
 * writes the evidence plus a manifest into the output directory. Exit code 0
 * means the whole capture is there; every other exit code means it is not,
 * and then no screenshot and no pdf is left behind.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import { captureViewport, ShotBudget, type ScreenshotArtifact } from './capture.js'
import { loadConfig, type Config } from './config.js'
import { observePage } from './diagnostics.js'
import { EXIT, classifyFailure, navigationError, renderingError } from './errors.js'
import { Logger } from './logging.js'
import {
  writeFailure,
  writeManifest,
  type Artifact,
  type FailureReport,
  type RunReport,
  type WorkflowSummary
} from './manifest.js'
import { discardResults, prepareOutput, type OutputDirs } from './output.js'
import { capturePrint, requirePrintTools } from './print.js'
import { SecretRegistry } from './secrets.js'
import { preScroll, settleNetwork, stabilize } from './stabilize.js'
import { BUILTIN_VIEWPORTS, expandViewports, type Viewport } from './viewports.js'
import { TOOL_NAME, TOOL_VERSION } from './version.js'
import { loadWorkflow, type Workflow } from './workflow.js'
import { WorkflowRunner, type StepResult } from './workflow-run.js'

interface SessionResult {
  context: BrowserContext
  page: Page
  steps: StepResult[]
  finalUrl: string
  title: string
}

const contextOptions = (config: Config, viewport: Viewport, storageState: unknown) => ({
  viewport: { width: viewport.width, height: viewport.height },
  deviceScaleFactor: viewport.deviceScaleFactor,
  isMobile: viewport.isMobile,
  hasTouch: viewport.hasTouch,
  locale: config.browser.locale,
  colorScheme: config.browser.colorScheme,
  reducedMotion: config.browser.reducedMotion,
  ignoreHTTPSErrors: config.browser.ignoreHttpsErrors,
  baseURL: config.url,
  ...(config.browser.timezone === null ? {} : { timezoneId: config.browser.timezone }),
  ...(config.browser.userAgent === null ? {} : { userAgent: config.browser.userAgent }),
  ...(Object.keys(config.browser.extraHeaders).length === 0
    ? {}
    : { extraHTTPHeaders: config.browser.extraHeaders }),
  ...(storageState ? { storageState: storageState as never } : {})
})

/** Open a fresh context, navigate, run the workflow and stabilize the result. */
const openSession = async (
  browser: Browser,
  config: Config,
  viewport: Viewport,
  workflow: Workflow | null,
  storageState: unknown,
  logger: Logger,
  secrets: SecretRegistry,
  /** handed over immediately, so a failure can still be photographed */
  onContext: (context: BrowserContext) => void
): Promise<SessionResult> => {
  const context = await browser.newContext(contextOptions(config, viewport, storageState))
  onContext(context)
  context.setDefaultTimeout(config.navigation.timeout)
  context.setDefaultNavigationTimeout(config.navigation.timeout)
  context.on('page', extra => observePage(extra, logger, viewport.name, config.diagnostics.captureConsole))

  const page = await context.newPage()
  observePage(page, logger, viewport.name, config.diagnostics.captureConsole)

  const response = await page
    .goto(config.url, { waitUntil: config.navigation.waitUntil, timeout: config.navigation.timeout })
    .catch(error => {
      throw navigationError(`cannot open ${config.url}: ${secrets.maskError(error)}`)
    })
  // no response means the document was replaced by a client side navigation
  // before it finished loading — normal for a page that redirects itself,
  // and no reason to fail: the workflow assertions decide where we ended up
  if (response === null) {
    logger.warn(`${viewport.name}: ${config.url} was replaced by a client side navigation while loading`)
  } else if (config.navigation.failOnErrorStatus && response.status() >= 400) {
    throw navigationError(
      `${config.url} answered http ${response.status()}; that is an error page, not the page to analyse ` +
        '(set navigation.failOnErrorStatus to false to capture it anyway)'
    )
  }

  let active = page
  let steps: StepResult[] = []
  if (workflow) {
    const runner = new WorkflowRunner(context, page, workflow, logger, secrets)
    const result = await runner.run()
    active = result.activePage
    steps = result.steps
  }

  // lazily loaded content has to exist before anything is measured, and the
  // loading it triggers has to settle before anything is captured
  await settleNetwork(active, config, logger, viewport.name)
  await preScroll(active, config)
  await stabilize(active, config, logger, viewport.name)

  return { context, page: active, steps, finalUrl: active.url(), title: await active.title() }
}

/** Stop the run when the page reported problems the configuration calls fatal. */
const assertPageHealth = (config: Config, logger: Logger, viewport: string): void => {
  const of = (kind: string): number =>
    logger.diagnostics.filter(item => item.kind === kind && item.viewport === viewport).length

  if (config.diagnostics.failOnPageError && of('pageerror') > 0) {
    throw renderingError(
      `${viewport}: the page threw ${of('pageerror')} uncaught javascript error(s); ` +
        'what it renders is not the intended page (set diagnostics.failOnPageError to false to capture it anyway)'
    )
  }
  if (config.diagnostics.failOnHttpError && of('httperror') > 0) {
    throw renderingError(
      `${viewport}: ${of('httperror')} request(s) failed with an http error; ` +
        'parts of the page are missing (set diagnostics.failOnHttpError to false to capture it anyway)'
    )
  }
}

/** Photograph the state at the moment of the failure.
 *
 * Skipped after an abort: the browser is already gone by then, and the state
 * a person interrupted is not a defect anyone needs a picture of.
 */
const debugShots = async (context: BrowserContext | null, dirs: OutputDirs, logger: Logger): Promise<string[]> => {
  if (!context) return []
  mkdirSync(dirs.debugDir, { recursive: true })
  const files: string[] = []
  for (const [index, page] of context.pages().entries()) {
    const name = `failure-page-${String(index + 1).padStart(2, '0')}.png`
    try {
      await page.screenshot({ path: join(dirs.debugDir, name), fullPage: false })
      files.push(join('debug', name))
    } catch (error) {
      logger.warn(`no debug screenshot for page ${index + 1}: ${(error as Error).message}`)
    }
  }
  return files
}

const run = async (): Promise<number> => {
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const secrets = new SecretRegistry()
  let logger = new Logger(secrets, 'info')
  let dirs: OutputDirs | null = null
  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let workflowSummary: WorkflowSummary | null = null
  let workflow: Workflow | null = null
  let url = process.env.TARGET_URL ?? '(not configured)'
  let stopSignal: string | null = null

  // ctrl-c on `docker compose up` and the shutdown of a container both arrive
  // as a signal. Closing the browser makes the pending call reject, which
  // carries the run into the failure path below, where it is reported as the
  // abort it is and the half finished results are thrown away.
  const onSignal = (signal: NodeJS.Signals): void => {
    if (stopSignal !== null) return
    stopSignal = signal
    logger.warn(`${signal} received, stopping the run`)
    if (browser) void browser.close().catch(() => undefined)
    else process.exit(EXIT.aborted)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    const config = loadConfig(process.env)
    url = config.url
    logger = new Logger(secrets, config.logLevel)
    logger.info(`${TOOL_NAME} ${TOOL_VERSION}`)
    logger.info(`target ${config.url}`)

    workflow = config.workflow.file ? loadWorkflow(config.workflow.file, secrets, process.env) : null
    if (workflow) {
      logger.info(`workflow ${workflow.name} with ${workflow.steps.length} step(s) from ${workflow.sourcePath}`)
      if (secrets.size > 0) logger.info(`${secrets.size} secret value(s) registered for masking`)
    }

    requirePrintTools(config)
    dirs = prepareOutput(config, logger)

    const specs = [
      ...config.viewports.presets.map(name => BUILTIN_VIEWPORTS.find(spec => spec.name === name)!),
      ...config.viewports.custom
    ]
    const viewports = expandViewports(specs, {
      derived: config.viewports.derived,
      minDerivedWidth: config.viewports.minDerivedWidth,
      onDrop: (name, reason) => logger.warn(`viewport ${name} dropped: ${reason}`),
      onDuplicate: (dropped, kept) => logger.info(`viewport ${dropped} equals ${kept} and was merged into it`)
    })
    logger.info(`${viewports.length} effective viewport(s)`)

    const printViewport = config.print.enabled
      ? viewports.find(
          item => item.name === config.print.viewport || item.aliases.includes(config.print.viewport)
        ) ?? viewports[0]!
      : null

    const capture = config.screenshots.enabled ? viewports : printViewport ? [printViewport] : []
    const budget = new ShotBudget(config.screenshots.maxShotsTotal, logger)
    const artifacts: Artifact[] = []
    let storageState: unknown = config.workflow.storageStateIn ?? null
    let finalUrl = config.url
    let title = ''

    browser = await chromium.launch({
      // a fixed colour profile keeps colours comparable between machines
      chromiumSandbox: config.browser.sandbox,
      args: ['--force-color-profile=srgb']
    }).catch(error => {
      const reason = secrets.maskError(error)
      if (config.browser.sandbox && /sandbox/i.test(reason)) {
        throw renderingError(
          'the browser sandbox was requested but this host cannot provide it: a current linux ' +
            'restricts unprivileged user namespaces, so chromium finds no usable sandbox inside a ' +
            'container. Either configure the host to allow them, or set CHROMIUM_SANDBOX=false and ' +
            'rely on the container as the isolation boundary'
        )
      }
      throw renderingError(`the browser did not start: ${reason}`)
    })
    logger.info(
      config.browser.sandbox
        ? 'the browser runs with its own sandbox'
        : 'the browser runs without its own sandbox, the container is the isolation boundary'
    )

    for (const viewport of capture) {
      logger.info(`capturing ${viewport.name} (${viewport.width}x${viewport.height} css px @${viewport.deviceScaleFactor}x)`)
      const session = await openSession(
        browser, config, viewport, workflow, storageState, logger, secrets,
        opened => { context = opened }
      )
      assertPageHealth(config, logger, viewport.name)

      if (workflow) {
        const first = workflowSummary === null
        workflowSummary ??= {
          file: workflow.sourcePath,
          name: workflow.name,
          version: workflow.version,
          status: 'completed',
          runs: []
        }
        workflowSummary.runs.push({ viewport: viewport.name, status: 'completed', steps: session.steps })
        if (first && config.workflow.reuseStorageState) storageState = await session.context.storageState()
        if (first && config.workflow.storageStateOut) {
          await session.context.storageState({ path: config.workflow.storageStateOut })
          logger.info(`authenticated browser state written to ${config.workflow.storageStateOut}`)
        }
      }
      if (finalUrl === config.url) {
        finalUrl = session.finalUrl
        title = session.title
      }

      if (config.screenshots.enabled) {
        const shots: ScreenshotArtifact[] = await captureViewport({
          page: session.page,
          viewport,
          config,
          logger,
          screenDir: dirs.screenDir,
          budget
        })
        artifacts.push(...shots)
        logger.info(`${viewport.name}: ${shots.length} screenshot(s)`)
      }

      if (printViewport && viewport.name === printViewport.name) {
        artifacts.push(
          ...(await capturePrint({
            page: session.page,
            config,
            logger,
            pdfDir: dirs.pdfDir,
            pngDir: dirs.pngDir
          }))
        )
      }

      await session.context.close()
      context = null
    }

    const finishedMs = Date.now()
    const report: RunReport = {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: finishedMs - startedMs,
      browserSandbox: config.browser.sandbox,
      requestedUrl: config.url,
      finalUrl,
      title,
      config,
      viewports,
      workflow: workflowSummary,
      artifacts,
      warnings: logger.warnings,
      limits: logger.limits,
      diagnostics: logger.diagnostics
    }
    writeManifest(dirs.outDir, report, secrets)
    logger.info(`${artifacts.length} artifact(s) written to ${dirs.outDir}`)
    return EXIT.ok
  } catch (error) {
    const scanner = classifyFailure(error, stopSignal)
    const message = secrets.mask(scanner.message)
    // an abort reads as a sentence, everything else names its category first
    logger.error(scanner.kind === 'aborted' ? message : `${scanner.kind} error: ${message}`)

    if (workflow) {
      workflowSummary ??= {
        file: workflow.sourcePath,
        name: workflow.name,
        version: workflow.version,
        status: 'failed',
        runs: []
      }
      if (scanner.kind === 'workflow') workflowSummary.status = 'failed'
    }

    if (dirs) {
      const files = scanner.kind === 'aborted' ? [] : await debugShots(context, dirs, logger)
      discardResults(dirs)
      mkdirSync(dirs.metaDir, { recursive: true })
      const failure: FailureReport = {
        startedAt,
        failedAt: new Date().toISOString(),
        requestedUrl: url,
        kind: scanner.kind,
        exitCode: scanner.exitCode,
        message,
        details: scanner.details,
        workflow: workflowSummary,
        debugFiles: files,
        warnings: logger.warnings,
        limits: logger.limits,
        diagnostics: logger.diagnostics
      }
      writeFailure(dirs.outDir, failure, secrets)
      logger.error(`details in ${join(dirs.outDir, 'meta', 'error.json')}`)
    }
    return scanner.exitCode
  } finally {
    if (browser) await browser.close().catch(() => undefined)
  }
}

const exitCode = await run()
process.exit(exitCode)
