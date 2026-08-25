/** Effective configuration: defaults, optional file, environment overrides.
 *
 * Precedence, lowest to highest: built-in defaults, configuration file,
 * environment variables. The result is validated strictly and is written to
 * the manifest, so a later reader can reproduce the exact run.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { configError } from './errors.js'
import type { Level } from './logging.js'
import { BUILTIN_VIEWPORTS, builtinNames, type ViewportKind, type ViewportSpec } from './viewports.js'
import {
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asObject,
  asOptionalString,
  asString,
  asStringArray,
  asStringMap,
  envBoolean,
  envList,
  envNumber
} from './validate.js'

export const PAPER_FORMATS = [
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Tabloid', 'Ledger'
] as const
export type PaperFormat = (typeof PAPER_FORMATS)[number]

export const ORIENTATIONS = ['portrait', 'landscape'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

export const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle', 'commit'] as const
export type WaitUntil = (typeof WAIT_UNTIL)[number]

export const ON_EXISTING = ['fail', 'overwrite'] as const
export type OnExisting = (typeof ON_EXISTING)[number]

export interface Config {
  url: string
  outDir: string
  onExisting: OnExisting
  logLevel: Level
  browser: {
    locale: string
    timezone: string | null
    colorScheme: 'light' | 'dark' | 'no-preference'
    reducedMotion: 'reduce' | 'no-preference'
    ignoreHttpsErrors: boolean
    userAgent: string | null
    extraHeaders: Record<string, string>
    sandbox: boolean
  }
  viewports: {
    presets: string[]
    custom: ViewportSpec[]
    derived: boolean
    minDerivedWidth: number
  }
  navigation: {
    waitUntil: WaitUntil
    timeout: number
    failOnErrorStatus: boolean
  }
  stabilize: {
    fonts: boolean
    networkIdle: boolean
    networkIdleTimeout: number
    settleMs: number
    scrollSettleMs: number
    freezeAnimations: boolean
    hideCaret: boolean
    preScroll: boolean
  }
  screenshots: {
    enabled: boolean
    viewportShot: boolean
    scrollSeries: boolean
    fullPage: boolean
    fullPageMaxHeight: number
    overlap: number
    maxStepsPerAxis: number
    maxShotsPerViewport: number
    maxShotsTotal: number
    regions: {
      enabled: boolean
      maxRegions: number
      maxDepth: number
      minWidth: number
      minHeight: number
      maxShotsPerRegion: number
    }
  }
  print: {
    enabled: boolean
    formats: PaperFormat[]
    orientations: Orientation[]
    margin: { top: string; right: string; bottom: string; left: string }
    printBackground: boolean
    preferCSSPageSize: boolean
    scale: number
    viewport: string
    png: {
      enabled: boolean
      dpi: number
    }
  }
  workflow: {
    file: string | null
    reuseStorageState: boolean
    storageStateIn: string | null
    storageStateOut: string | null
  }
  diagnostics: {
    captureConsole: boolean
    failOnPageError: boolean
    failOnHttpError: boolean
  }
}

const CONFIG_KEYS = [
  'version', 'url', 'out', 'onExisting', 'logLevel', 'browser', 'viewports',
  'navigation', 'stabilize', 'screenshots', 'print', 'workflow', 'diagnostics'
] as const

export const CONFIG_VERSION = 1

const readStructured = (path: string): unknown => {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw configError(`cannot read configuration file ${path}: ${(error as Error).message}`)
  }
  try {
    return path.endsWith('.json') ? JSON.parse(text) : parseYaml(text)
  } catch (error) {
    throw configError(`cannot parse configuration file ${path}: ${(error as Error).message}`)
  }
}

const parseCustomViewports = (value: unknown, path: string): ViewportSpec[] =>
  asArray(value, path, []).map((entry, index) => {
    const item = asObject(entry, `${path}[${index}]`, [
      'name', 'width', 'height', 'kind', 'deviceScaleFactor', 'isMobile', 'hasTouch', 'note'
    ])
    return {
      name: asString(item.name, `${path}[${index}].name`),
      width: asNumber(item.width, `${path}[${index}].width`, 0, { min: 1, integer: true }),
      height: asNumber(item.height, `${path}[${index}].height`, 0, { min: 1, integer: true }),
      kind: asEnum<ViewportKind>(item.kind, `${path}[${index}].kind`, ['desktop', 'tablet', 'phone'], 'desktop'),
      deviceScaleFactor: asNumber(
        item.deviceScaleFactor, `${path}[${index}].deviceScaleFactor`, 1, { min: 0.1, max: 4 }
      ),
      isMobile: asBoolean(item.isMobile, `${path}[${index}].isMobile`, false),
      hasTouch: asBoolean(item.hasTouch, `${path}[${index}].hasTouch`, false),
      note: asOptionalString(item.note, `${path}[${index}].note`, '') ?? ''
    }
  })

const requireWidthHeight = (specs: ViewportSpec[]): void => {
  for (const spec of specs) {
    if (spec.width <= 0 || spec.height <= 0) {
      throw configError(`viewports.custom: ${spec.name} needs a width and a height greater than zero`)
    }
  }
}

export interface Environment {
  [key: string]: string | undefined
}

/** Build the effective configuration from file and environment. */
export const loadConfig = (env: Environment): Config => {
  const file = env.CONFIG_FILE && env.CONFIG_FILE !== '' ? env.CONFIG_FILE : null
  const raw = file ? readStructured(file) : {}
  if (raw !== null && typeof raw !== 'object') {
    throw configError(`configuration file ${file}: expected a mapping at the top level`)
  }
  const root = asObject(raw ?? {}, 'config', CONFIG_KEYS)

  const version = asNumber(root.version, 'config.version', CONFIG_VERSION, { integer: true, min: 1 })
  if (version !== CONFIG_VERSION) {
    throw configError(`config.version: this build understands version ${CONFIG_VERSION}, got ${version}`)
  }

  const browser = asObject(root.browser, 'config.browser', [
    'locale', 'timezone', 'colorScheme', 'reducedMotion', 'ignoreHttpsErrors', 'userAgent',
    'extraHeaders', 'sandbox'
  ])
  const viewports = asObject(root.viewports, 'config.viewports', [
    'presets', 'custom', 'derived', 'minDerivedWidth'
  ])
  const navigation = asObject(root.navigation, 'config.navigation', ['waitUntil', 'timeout', 'failOnErrorStatus'])
  const stabilize = asObject(root.stabilize, 'config.stabilize', [
    'fonts', 'networkIdle', 'networkIdleTimeout', 'settleMs', 'scrollSettleMs',
    'freezeAnimations', 'hideCaret', 'preScroll'
  ])
  const screenshots = asObject(root.screenshots, 'config.screenshots', [
    'enabled', 'viewportShot', 'scrollSeries', 'fullPage', 'fullPageMaxHeight', 'overlap',
    'maxStepsPerAxis', 'maxShotsPerViewport', 'maxShotsTotal', 'regions'
  ])
  const regions = asObject(screenshots.regions, 'config.screenshots.regions', [
    'enabled', 'maxRegions', 'maxDepth', 'minWidth', 'minHeight', 'maxShotsPerRegion'
  ])
  const print = asObject(root.print, 'config.print', [
    'enabled', 'formats', 'orientations', 'margin', 'printBackground', 'preferCSSPageSize',
    'scale', 'viewport', 'png'
  ])
  const margin = asObject(print.margin, 'config.print.margin', ['top', 'right', 'bottom', 'left'])
  const png = asObject(print.png, 'config.print.png', ['enabled', 'dpi'])
  const workflow = asObject(root.workflow, 'config.workflow', [
    'file', 'reuseStorageState', 'storageStateIn', 'storageStateOut'
  ])
  const diagnostics = asObject(root.diagnostics, 'config.diagnostics', [
    'captureConsole', 'failOnPageError', 'failOnHttpError'
  ])

  const presetNames = envList(env.VIEWPORTS) ?? asStringArray(viewports.presets, 'config.viewports.presets', builtinNames())
  const unknownPresets = presetNames.filter(name => !builtinNames().includes(name))
  if (unknownPresets.length > 0) {
    throw configError(
      `viewports.presets: unknown preset(s) ${unknownPresets.join(', ')} (known: ${builtinNames().join(', ')})`
    )
  }

  const custom = parseCustomViewports(viewports.custom, 'config.viewports.custom')
  requireWidthHeight(custom)

  const formatNames = envList(env.PRINT_FORMATS) ?? asStringArray(print.formats, 'config.print.formats', ['A3', 'A4', 'A5', 'Letter'])
  for (const format of formatNames) {
    if (!(PAPER_FORMATS as readonly string[]).includes(format)) {
      throw configError(`print.formats: unknown paper format ${format} (known: ${PAPER_FORMATS.join(', ')})`)
    }
  }

  const orientationNames = envList(env.PRINT_ORIENTATIONS)
    ?? asStringArray(print.orientations, 'config.print.orientations', ['portrait', 'landscape'])
  for (const orientation of orientationNames) {
    if (!(ORIENTATIONS as readonly string[]).includes(orientation)) {
      throw configError(`print.orientations: expected portrait or landscape, got ${orientation}`)
    }
  }

  const url = env.TARGET_URL && env.TARGET_URL !== ''
    ? env.TARGET_URL
    : asString(root.url, 'config.url', '')
  if (url === '') {
    throw configError('no target url: set TARGET_URL or `url` in the configuration file')
  }
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
      throw configError(`url: unsupported scheme ${parsed.protocol} (use http, https or file)`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ScannerError') throw error
    throw configError(`url: not a valid url: ${url}`)
  }

  const presetSpecs = presetNames.map(name => BUILTIN_VIEWPORTS.find(spec => spec.name === name)!)
  const allNames = [...presetSpecs, ...custom].map(spec => spec.name)
  const duplicateNames = allNames.filter((name, index) => allNames.indexOf(name) !== index)
  if (duplicateNames.length > 0) {
    throw configError(`viewports: duplicate viewport name(s) ${[...new Set(duplicateNames)].join(', ')}`)
  }
  if (allNames.length === 0) {
    throw configError('viewports: at least one preset or custom viewport is required')
  }

  // the print output is produced from the state of one viewport; without an
  // explicit choice that is full-hd where it is configured, otherwise the
  // first configured viewport — which always exists
  const defaultPrintViewport = allNames.includes('full-hd') ? 'full-hd' : allNames[0]!
  const printViewport = asString(print.viewport, 'config.print.viewport', defaultPrintViewport)
  if (!allNames.includes(printViewport)) {
    throw configError(
      `print.viewport: ${printViewport} is not among the configured viewports (${allNames.join(', ')})`
    )
  }

  const config: Config = {
    url,
    outDir: env.OUT_DIR && env.OUT_DIR !== '' ? env.OUT_DIR : asString(root.out, 'config.out', '/out'),
    onExisting: (env.ON_EXISTING as OnExisting | undefined)
      ? asEnum<OnExisting>(env.ON_EXISTING, 'ON_EXISTING', ON_EXISTING)
      : asEnum<OnExisting>(root.onExisting, 'config.onExisting', ON_EXISTING, 'fail'),
    logLevel: (env.LOG_LEVEL as Level | undefined)
      ? asEnum<Level>(env.LOG_LEVEL, 'LOG_LEVEL', ['debug', 'info', 'warn', 'error'])
      : asEnum<Level>(root.logLevel, 'config.logLevel', ['debug', 'info', 'warn', 'error'], 'info'),
    browser: {
      locale: asString(browser.locale, 'config.browser.locale', 'en-US'),
      timezone: asOptionalString(browser.timezone, 'config.browser.timezone', null),
      colorScheme: asEnum(browser.colorScheme, 'config.browser.colorScheme', ['light', 'dark', 'no-preference'], 'light'),
      reducedMotion: asEnum(browser.reducedMotion, 'config.browser.reducedMotion', ['reduce', 'no-preference'], 'no-preference'),
      ignoreHttpsErrors: asBoolean(browser.ignoreHttpsErrors, 'config.browser.ignoreHttpsErrors', false),
      userAgent: asOptionalString(browser.userAgent, 'config.browser.userAgent', null),
      extraHeaders: asStringMap(browser.extraHeaders, 'config.browser.extraHeaders', {}),
      // off by default, like playwright itself: a current linux restricts
      // unprivileged user namespaces, so the browser cannot build its own
      // sandbox inside a container. The container is the isolation boundary;
      // switching this on demands a host that can deliver it and fails loudly
      // where it cannot.
      sandbox: envBoolean(env.CHROMIUM_SANDBOX, 'CHROMIUM_SANDBOX')
        ?? asBoolean(browser.sandbox, 'config.browser.sandbox', false)
    },
    viewports: {
      presets: presetNames,
      custom,
      derived: envBoolean(env.DERIVED_VIEWPORTS, 'DERIVED_VIEWPORTS')
        ?? asBoolean(viewports.derived, 'config.viewports.derived', true),
      minDerivedWidth: asNumber(viewports.minDerivedWidth, 'config.viewports.minDerivedWidth', 320, { min: 1, integer: true })
    },
    navigation: {
      waitUntil: asEnum<WaitUntil>(navigation.waitUntil, 'config.navigation.waitUntil', WAIT_UNTIL, 'load'),
      timeout: envNumber(env.NAVIGATION_TIMEOUT, 'NAVIGATION_TIMEOUT')
        ?? asNumber(navigation.timeout, 'config.navigation.timeout', 30000, { min: 1000, integer: true }),
      failOnErrorStatus: asBoolean(navigation.failOnErrorStatus, 'config.navigation.failOnErrorStatus', true)
    },
    stabilize: {
      fonts: asBoolean(stabilize.fonts, 'config.stabilize.fonts', true),
      networkIdle: asBoolean(stabilize.networkIdle, 'config.stabilize.networkIdle', true),
      networkIdleTimeout: asNumber(stabilize.networkIdleTimeout, 'config.stabilize.networkIdleTimeout', 10000, { min: 0, integer: true }),
      settleMs: envNumber(env.SETTLE_MS, 'SETTLE_MS')
        ?? asNumber(stabilize.settleMs, 'config.stabilize.settleMs', 1000, { min: 0, integer: true }),
      scrollSettleMs: asNumber(stabilize.scrollSettleMs, 'config.stabilize.scrollSettleMs', 400, { min: 0, integer: true }),
      freezeAnimations: asBoolean(stabilize.freezeAnimations, 'config.stabilize.freezeAnimations', true),
      hideCaret: asBoolean(stabilize.hideCaret, 'config.stabilize.hideCaret', true),
      preScroll: asBoolean(stabilize.preScroll, 'config.stabilize.preScroll', true)
    },
    screenshots: {
      enabled: envBoolean(env.SCREENSHOTS, 'SCREENSHOTS')
        ?? asBoolean(screenshots.enabled, 'config.screenshots.enabled', true),
      viewportShot: asBoolean(screenshots.viewportShot, 'config.screenshots.viewportShot', true),
      scrollSeries: asBoolean(screenshots.scrollSeries, 'config.screenshots.scrollSeries', true),
      fullPage: asBoolean(screenshots.fullPage, 'config.screenshots.fullPage', true),
      fullPageMaxHeight: asNumber(screenshots.fullPageMaxHeight, 'config.screenshots.fullPageMaxHeight', 30000, { min: 1, integer: true }),
      overlap: asNumber(screenshots.overlap, 'config.screenshots.overlap', 0.1, { min: 0, max: 0.9 }),
      maxStepsPerAxis: asNumber(screenshots.maxStepsPerAxis, 'config.screenshots.maxStepsPerAxis', 200, { min: 1, integer: true }),
      maxShotsPerViewport: asNumber(screenshots.maxShotsPerViewport, 'config.screenshots.maxShotsPerViewport', 1000, { min: 1, integer: true }),
      maxShotsTotal: asNumber(screenshots.maxShotsTotal, 'config.screenshots.maxShotsTotal', 10000, { min: 1, integer: true }),
      regions: {
        enabled: asBoolean(regions.enabled, 'config.screenshots.regions.enabled', true),
        maxRegions: asNumber(regions.maxRegions, 'config.screenshots.regions.maxRegions', 25, { min: 0, integer: true }),
        maxDepth: asNumber(regions.maxDepth, 'config.screenshots.regions.maxDepth', 4, { min: 1, integer: true }),
        minWidth: asNumber(regions.minWidth, 'config.screenshots.regions.minWidth', 120, { min: 1, integer: true }),
        minHeight: asNumber(regions.minHeight, 'config.screenshots.regions.minHeight', 120, { min: 1, integer: true }),
        maxShotsPerRegion: asNumber(regions.maxShotsPerRegion, 'config.screenshots.regions.maxShotsPerRegion', 200, { min: 1, integer: true })
      }
    },
    print: {
      enabled: envBoolean(env.PRINT, 'PRINT') ?? asBoolean(print.enabled, 'config.print.enabled', true),
      formats: formatNames as PaperFormat[],
      orientations: orientationNames as Orientation[],
      margin: {
        top: asString(margin.top, 'config.print.margin.top', '10mm'),
        right: asString(margin.right, 'config.print.margin.right', '10mm'),
        bottom: asString(margin.bottom, 'config.print.margin.bottom', '10mm'),
        left: asString(margin.left, 'config.print.margin.left', '10mm')
      },
      printBackground: asBoolean(print.printBackground, 'config.print.printBackground', true),
      preferCSSPageSize: asBoolean(print.preferCSSPageSize, 'config.print.preferCSSPageSize', false),
      scale: asNumber(print.scale, 'config.print.scale', 1, { min: 0.1, max: 2 }),
      viewport: printViewport,
      png: {
        enabled: asBoolean(png.enabled, 'config.print.png.enabled', true),
        dpi: asNumber(png.dpi, 'config.print.png.dpi', 150, { min: 20, max: 600, integer: true })
      }
    },
    workflow: {
      file: env.WORKFLOW_FILE && env.WORKFLOW_FILE !== ''
        ? env.WORKFLOW_FILE
        : asOptionalString(workflow.file, 'config.workflow.file', null),
      reuseStorageState: asBoolean(workflow.reuseStorageState, 'config.workflow.reuseStorageState', true),
      storageStateIn: env.STORAGE_STATE && env.STORAGE_STATE !== ''
        ? env.STORAGE_STATE
        : asOptionalString(workflow.storageStateIn, 'config.workflow.storageStateIn', null),
      storageStateOut: env.STORAGE_STATE_OUT && env.STORAGE_STATE_OUT !== ''
        ? env.STORAGE_STATE_OUT
        : asOptionalString(workflow.storageStateOut, 'config.workflow.storageStateOut', null)
    },
    diagnostics: {
      captureConsole: asBoolean(diagnostics.captureConsole, 'config.diagnostics.captureConsole', true),
      failOnPageError: asBoolean(diagnostics.failOnPageError, 'config.diagnostics.failOnPageError', false),
      failOnHttpError: asBoolean(diagnostics.failOnHttpError, 'config.diagnostics.failOnHttpError', false)
    }
  }

  if (config.print.enabled && config.print.formats.length === 0) {
    throw configError('print.formats: at least one paper format is required while printing is enabled')
  }
  if (config.print.enabled && config.print.orientations.length === 0) {
    throw configError('print.orientations: at least one orientation is required while printing is enabled')
  }
  if (!config.screenshots.enabled && !config.print.enabled) {
    throw configError('nothing to capture: screenshots and print are both disabled')
  }

  // resolved, never compared as written: `out/state.json` under `out: ./out`
  // reads like a path outside the results and lands inside them, and the guard
  // that keeps login credentials out of the shipped material would wave it
  // through
  const outDir = resolve(config.outDir)
  const inside = (path: string | null): boolean => {
    if (path === null) return false
    const target = resolve(path)
    return target === outDir || target.startsWith(`${outDir}/`)
  }
  if (inside(config.workflow.storageStateOut)) {
    throw configError(
      'workflow.storageStateOut: a storage state carries login credentials and must not be written into the output directory'
    )
  }

  return config
}

/** The configuration as it goes into the manifest — file paths only, never contents. */
export const publicConfig = (config: Config): Record<string, unknown> =>
  JSON.parse(JSON.stringify(config)) as Record<string, unknown>
