/** Every scenario is a complete run of the delivered image against real
 * pages in a real browser, driven through docker compose exactly the way a
 * user drives it. The results are fetched out of the volume with
 * `docker compose cp` — nothing is mounted from the host, so what the tests
 * inspect is what the container actually wrote.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const COMPOSE = 'tests/e2e/docker-compose.yml'
const RESULTS = join(ROOT, 'tests', 'e2e', 'results')

/** `basic` has to run before `existing`, which re-uses its volume. */
const SCENARIOS = [
  'basic', 'existing', 'repeat', 'regions', 'lazy', 'wide', 'login', 'loginfail',
  'limits', 'printcss', 'badconfig', 'notfound', 'envonly'
] as const
/** `abort` is driven differently: it has to be interrupted while it runs. */
type Scenario = (typeof SCENARIOS)[number] | 'abort'

interface Outcome {
  exit: number
  output: string
  dir: string
}

const results = new Map<Scenario, Outcome>()

const compose = (...args: string[]) =>
  spawnSync('docker', ['compose', '-f', COMPOSE, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })

const run = (service: Scenario): Outcome => {
  // --exit-code-from implies --abort-on-container-exit and hands the exit
  // code of the scanner back, which is what every scenario asserts on
  const up = compose('up', '--exit-code-from', service, service)
  const dir = join(RESULTS, service)
  compose('cp', `${service}:/out`, dir)
  return { exit: up.status ?? -1, output: `${up.stdout ?? ''}\n${up.stderr ?? ''}`, dir }
}

/** Start the run, wait until it is really capturing, then stop it from
 * outside — the same signal `docker compose up` sends on ctrl-c. */
const runAborted = async (): Promise<Outcome> => {
  compose('up', '-d', 'abort')
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if ((compose('logs', 'abort').stdout ?? '').includes('capturing ')) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  compose('stop', '-t', '30', 'abort')

  const id = (compose('ps', '-aq', 'abort').stdout ?? '').trim().split('\n')[0] ?? ''
  const inspected = spawnSync('docker', ['inspect', '--format', '{{.State.ExitCode}}', id], { encoding: 'utf8' })
  const dir = join(RESULTS, 'abort')
  compose('cp', 'abort:/out', dir)
  return {
    exit: Number((inspected.stdout ?? '').trim()),
    output: compose('logs', 'abort').stdout ?? '',
    dir
  }
}

const outcome = (scenario: Scenario): Outcome => {
  const found = results.get(scenario)
  if (!found) throw new Error(`scenario ${scenario} did not run`)
  return found
}

const file = (scenario: Scenario, ...parts: string[]): string => join(outcome(scenario).dir, ...parts)
const has = (scenario: Scenario, ...parts: string[]): boolean => existsSync(file(scenario, ...parts))
const read = (scenario: Scenario, ...parts: string[]): string => readFileSync(file(scenario, ...parts), 'utf8')
const json = (scenario: Scenario, ...parts: string[]): Manifest => JSON.parse(read(scenario, ...parts)) as Manifest

interface ImageInfo {
  width: number
  height: number
  bytes: number
}

interface Artifact {
  type: string
  capture?: string
  path: string
  viewport?: string
  viewportWidth?: number
  viewportHeight?: number
  sequence?: number
  scroll?: { x: number; y: number }
  mainScroll?: { x: number; y: number } | null
  region?: { id: string; label: string; depth: number; selector: string; scroll: { x: number; y: number } } | null
  image?: ImageInfo
  format?: string
  orientation?: string
  pages?: number
  page?: number
  preferCSSPageSize?: boolean
}

interface Manifest {
  manifestVersion: number
  tool: { name: string; version: string }
  run: {
    status: string
    startedAt: string
    finishedAt?: string
    durationMs?: number
    failedAt?: string
    browserSandbox?: boolean
  }
  target: { requestedUrl: string; finalUrl?: string; title?: string }
  config: Record<string, never>
  viewports: Array<{
    name: string
    width: number
    height: number
    deviceScaleFactor: number
    kind: string
    derivedFrom: string | null
    fraction: string | null
    aliases: string[]
  }>
  workflow: {
    file: string
    name: string
    status: string
    runs: Array<{ viewport: string; status: string; steps: Array<{ index: number; label: string; status: string; reason?: string }> }>
  } | null
  artifacts: Artifact[]
  error?: { kind: string; exitCode: number; message: string }
  debug?: string[]
  diagnostics: {
    warnings: string[]
    limits: Array<{ limit: string; configured: number; wanted: number; applied: number; where: string }>
    pageEvents: Array<{ kind: string; text: string }>
  }
}

const screenshots = (manifest: Manifest, capture?: string): Artifact[] =>
  manifest.artifacts.filter(item => item.type === 'screenshot' && (capture === undefined || item.capture === capture))

beforeAll(async () => {
  rmSync(RESULTS, { recursive: true, force: true })
  mkdirSync(RESULTS, { recursive: true })
  for (const scenario of SCENARIOS) {
    results.set(scenario, run(scenario))
    // every scenario blocks this worker for seconds at a time; without a
    // breath in between, the channel the reporter runs on is starved until it
    // times out and the suite fails although every test passed
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  results.set('abort', await runAborted())
})

// ------------------------------------------------------------- the basics ---

describe('a complete run of a long page', () => {
  it('reports success', () => {
    expect(outcome('basic').exit).toBe(0)
  })

  it('writes the documented directory structure', () => {
    expect(has('basic', 'screen')).toBe(true)
    expect(has('basic', 'print', 'pdf')).toBe(true)
    expect(has('basic', 'print', 'png')).toBe(true)
    expect(has('basic', 'meta', 'manifest.json')).toBe(true)
    expect(has('basic', 'meta', 'summary.md')).toBe(true)
  })

  it('names the tool, the target and the page it really reached', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    expect(manifest.tool.name).toBe('@mwaeckerlin/webdesign-scanner')
    expect(manifest.run.status).toBe('ok')
    expect(manifest.target.requestedUrl).toBe('http://site:8080/index.html')
    expect(manifest.target.finalUrl).toBe('http://site:8080/index.html')
    expect(manifest.target.title).toBe('Scanner test page')
  })

  it('captures the configured viewports including the derived half width', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    expect(manifest.viewports.map(item => item.name)).toEqual(['hd', 'phone-medium', 'hd-half'])
    const half = manifest.viewports.find(item => item.name === 'hd-half')!
    expect(half.width).toBe(640)
    expect(half.height).toBe(720)
    expect(half.derivedFrom).toBe('hd')
    expect(half.fraction).toBe('1/2')
  })

  it('takes what a visitor sees the moment the page is ready, for every viewport', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const first = screenshots(manifest, 'viewport')
    expect(first.map(item => item.viewport).sort()).toEqual(['hd', 'hd-half', 'phone-medium'])
    for (const shot of first) expect(shot.scroll).toEqual({ x: 0, y: 0 })
  })

  it('renders at the pixel density of the viewport', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const shot = (viewport: string) => screenshots(manifest, 'viewport').find(item => item.viewport === viewport)!
    expect(shot('hd').image).toMatchObject({ width: 1280, height: 720 })
    expect(shot('hd-half').image).toMatchObject({ width: 640, height: 720 })
    // a phone is emulated with a retina display: twice the pixels per css pixel
    expect(shot('phone-medium').image).toMatchObject({ width: 780, height: 1688 })
  })

  it('walks the whole document in a scroll series that ends at the very bottom', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const series = screenshots(manifest, 'scroll').filter(item => item.viewport === 'hd')
    expect(series.length).toBeGreaterThan(2)
    expect(series[0]!.scroll!.y).toBe(0)
    const positions = series.map(item => item.scroll!.y)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(new Set(positions).size).toBe(positions.length)
    const fullPage = screenshots(manifest, 'fullpage').find(item => item.viewport === 'hd')!
    // the last position is the bottom of the document, up to the rounding of
    // a fractional document height
    expect(Math.abs(positions.at(-1)! - (fullPage.image!.height - 720))).toBeLessThanOrEqual(2)
  })

  it('overlaps two neighbouring shots, so nothing falls between them', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const positions = screenshots(manifest, 'scroll')
      .filter(item => item.viewport === 'hd')
      .map(item => item.scroll!.y)
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]! - positions[index - 1]!).toBeLessThanOrEqual(720)
    }
  })

  it('produces one full page image per viewport', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const full = screenshots(manifest, 'fullpage')
    expect(full.map(item => item.viewport).sort()).toEqual(['hd', 'hd-half', 'phone-medium'])
    for (const shot of full) expect(shot.image!.height).toBeGreaterThan(shot.viewportHeight!)
  })

  it('gives every file a name that says what it shows', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    for (const shot of screenshots(manifest)) {
      expect(shot.path).toMatch(
        /^screen\/[a-z0-9-]+-\d+x\d+-(viewport|scroll|fullpage)-\d{3}-x\d{5}y\d{5}\.png$/
      )
      expect(shot.path).toContain(`${shot.viewportWidth}x${shot.viewportHeight}`)
    }
    const names = screenshots(manifest).map(item => item.path)
    expect(new Set(names).size).toBe(names.length)
  })

  it('writes every file the manifest promises, in the size it promises', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    for (const artifact of manifest.artifacts) expect(has('basic', ...artifact.path.split('/'))).toBe(true)
    const onDisk = readdirSync(file('basic', 'screen'))
    expect(onDisk.length).toBe(screenshots(manifest).length)
  })

  it('prints the configured paper format and renders every printed page', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    const pdfs = manifest.artifacts.filter(item => item.type === 'pdf')
    expect(pdfs).toHaveLength(1)
    expect(pdfs[0]!.format).toBe('A4')
    expect(pdfs[0]!.orientation).toBe('portrait')
    expect(pdfs[0]!.pages).toBeGreaterThan(1)
    expect(pdfs[0]!.path).toBe('print/pdf/a4-portrait.pdf')

    const images = manifest.artifacts.filter(item => item.type === 'pdf-page-image')
    expect(images).toHaveLength(pdfs[0]!.pages!)
    expect(images.map(item => item.page)).toEqual(images.map((_, index) => index + 1))
    // A4 upright at 96 dpi, so the printed page is taller than it is wide
    for (const image of images) expect(image.image!.height).toBeGreaterThan(image.image!.width)
  })

  it('writes a summary a person can read', () => {
    const summary = read('basic', 'meta', 'summary.md')
    expect(summary).toContain('# Capture summary')
    expect(summary).toContain('http://site:8080/index.html')
    expect(summary).toContain('1280x720')
    expect(summary).toContain('css pixels of the layout viewport')
  })

  it('reports no javascript error for a healthy page', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    expect(manifest.diagnostics.pageEvents.filter(item => item.kind === 'pageerror')).toEqual([])
  })

  it('settles without a warning on a page that behaves', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    expect(manifest.diagnostics.warnings).toEqual([])
    expect(manifest.diagnostics.limits).toEqual([])
  })

  it('says whether the browser had a sandbox of its own', () => {
    const manifest = json('basic', 'meta', 'manifest.json')
    expect(typeof manifest.run.browserSandbox).toBe('boolean')
    const summary = read('basic', 'meta', 'summary.md')
    expect(summary).toContain('Browser sandbox:')
  })
})

describe('the same page captured a second time', () => {
  it('reports success for the repeated run', () => {
    expect(outcome('repeat').exit).toBe(0)
  })

  it('produces an image identical to the earlier run, byte for byte', () => {
    const name = 'hd-1280x720-viewport-000-x00000y00000.png'
    const first = readFileSync(file('basic', 'screen', name))
    const second = readFileSync(file('repeat', 'screen', name))
    // webfonts loaded, animations and caret frozen, network settled: two
    // runs of the same page are comparable instead of differing by noise
    expect(second.equals(first)).toBe(true)
  })
})

// ------------------------------------------- protection of earlier results ---

describe('a second run into a directory that already holds results', () => {
  it('stops with an output error', () => {
    expect(outcome('existing').exit).toBe(3)
  })

  it('says what is in the way and how to proceed', () => {
    expect(outcome('existing').output).toMatch(/already holds results/)
    expect(outcome('existing').output).toMatch(/ON_EXISTING=overwrite/)
  })

  it('leaves the earlier results completely untouched', () => {
    const before = json('basic', 'meta', 'manifest.json')
    const after = json('existing', 'meta', 'manifest.json')
    expect(after.run.startedAt).toBe(before.run.startedAt)
    expect(after.artifacts.length).toBe(before.artifacts.length)
    expect(has('existing', 'meta', 'error.json')).toBe(false)
  })
})

// ------------------------------------------------- inner scrollable areas ---

describe('independently scrollable inner areas', () => {
  it('reports success', () => {
    expect(outcome('regions').exit).toBe(0)
  })

  it('finds every visible area that really scrolls', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const labels = new Set(screenshots(manifest, 'region').map(item => item.region!.label))
    expect(labels).toContain('First scroll area')
    expect(labels).toContain('Second scroll area')
    expect(labels).toContain('Nested scroll area')
    expect(labels).toContain('Sideways scroll area')
  })

  it('ignores an overflow box whose content fits, it would only duplicate', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const labels = screenshots(manifest, 'region').map(item => item.region!.label)
    expect(labels).not.toContain('Fitting area')
  })

  it('follows an area that is nested inside another one', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const nested = screenshots(manifest, 'region').filter(item => item.region!.label === 'Nested scroll area')
    expect(nested.length).toBeGreaterThan(1)
    expect(nested[0]!.region!.depth).toBe(2)
  })

  it('captures each area over its own positions, ending at its own bottom', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const first = screenshots(manifest, 'region').filter(item => item.region!.label === 'First scroll area')
    expect(first.length).toBeGreaterThan(1)
    expect(first[0]!.region!.scroll.y).toBe(0)
    expect(first.at(-1)!.region!.scroll.y).toBeGreaterThan(0)
  })

  it('follows a sideways area sideways', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const sideways = screenshots(manifest, 'region').filter(item => item.region!.label === 'Sideways scroll area')
    expect(sideways.some(item => item.region!.scroll.x > 0)).toBe(true)
  })

  it('never multiplies the positions of two independent areas', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    const perRegion = new Map<string, number>()
    for (const shot of screenshots(manifest, 'region')) {
      perRegion.set(shot.region!.id, (perRegion.get(shot.region!.id) ?? 0) + 1)
    }
    const counts = [...perRegion.values()]
    const sum = counts.reduce((total, count) => total + count, 0)
    const product = counts.reduce((total, count) => total * count, 1)
    expect(sum).toBe(screenshots(manifest, 'region').length)
    expect(sum).toBeLessThan(product)
  })

  it('records where the main document stood while an inner area was captured', () => {
    const manifest = json('regions', 'meta', 'manifest.json')
    for (const shot of screenshots(manifest, 'region')) {
      expect(shot.mainScroll).not.toBeNull()
      expect(shot.path).toMatch(/-region-\d{3}-x\d{5}y\d{5}-r\d{2}-main-x\d{5}y\d{5}\.png$/)
    }
  })
})

// ------------------------------------------------------------ lazy loading ---

describe('a document that grows while it is being captured', () => {
  it('reports success', () => {
    expect(outcome('lazy').exit).toBe(0)
  })

  it('extends the scroll series to the content that appeared during the run', () => {
    const manifest = json('lazy', 'meta', 'manifest.json')
    const series = screenshots(manifest, 'scroll')
    // one screen of content existed at the start; three more were added
    expect(series.length).toBeGreaterThan(3)
    expect(series.at(-1)!.scroll!.y).toBeGreaterThan(1500)
  })

  it('still ends at the true bottom of the grown document', () => {
    const manifest = json('lazy', 'meta', 'manifest.json')
    const last = screenshots(manifest, 'scroll').at(-1)!
    const full = screenshots(manifest, 'fullpage')[0]!
    expect(Math.abs(last.scroll!.y - (full.image!.height - 720))).toBeLessThanOrEqual(2)
  })
})

// ------------------------------------------------------ horizontal scrolling ---

describe('a document that also scrolls sideways', () => {
  it('reports success', () => {
    expect(outcome('wide').exit).toBe(0)
  })

  it('captures the positions to the right as well', () => {
    const manifest = json('wide', 'meta', 'manifest.json')
    const series = screenshots(manifest, 'scroll')
    expect(series.some(item => item.scroll!.x > 0)).toBe(true)
    expect(Math.max(...series.map(item => item.scroll!.x))).toBeGreaterThan(1000)
  })

  it('writes the horizontal position into the file name', () => {
    const manifest = json('wide', 'meta', 'manifest.json')
    const sideways = screenshots(manifest, 'scroll').find(item => item.scroll!.x > 0)!
    expect(sideways.path).toContain(`x${String(sideways.scroll!.x).padStart(5, '0')}`)
  })
})

// -------------------------------------------------- login and verification ---

describe('a page behind a login', () => {
  it('reports success', () => {
    expect(outcome('login').exit).toBe(0)
  })

  it('arrives at the page that was actually meant', () => {
    const manifest = json('login', 'meta', 'manifest.json')
    expect(manifest.target.requestedUrl).toBe('http://site:8080/login.html')
    expect(manifest.target.finalUrl).toBe('http://site:8080/app.html')
    expect(manifest.target.title).toBe('Dashboard')
  })

  it('replays the workflow for every viewport', () => {
    const manifest = json('login', 'meta', 'manifest.json')
    expect(manifest.workflow!.status).toBe('completed')
    expect(manifest.workflow!.runs.map(item => item.viewport)).toEqual(['hd', 'phone-medium'])
  })

  it('signs in on the first viewport and re-uses the session on the next', () => {
    const manifest = json('login', 'meta', 'manifest.json')
    const step = (run: number, label: string) =>
      manifest.workflow!.runs[run]!.steps.find(item => item.label === label)!
    expect(step(0, 'user name').status).toBe('ok')
    expect(step(0, 'submit').status).toBe('ok')
    expect(step(0, 'continue with the existing session').status).toBe('skipped')
    expect(step(1, 'user name').status).toBe('skipped')
    expect(step(1, 'submit').status).toBe('skipped')
    expect(step(1, 'continue with the existing session').status).toBe('ok')
  })

  it('walks past a step that is allowed to fail', () => {
    const manifest = json('login', 'meta', 'manifest.json')
    const optional = manifest.workflow!.runs[0]!.steps.find(item => item.label === 'dismiss a hint that is not there')!
    expect(optional.status).toBe('skipped')
    expect(optional.reason).toBeTruthy()
  })

  it('captures the page behind the login, not the login form', () => {
    const manifest = json('login', 'meta', 'manifest.json')
    expect(screenshots(manifest).length).toBeGreaterThan(0)
    for (const shot of screenshots(manifest)) expect(has('login', ...shot.path.split('/'))).toBe(true)
  })

  it('never writes the password into the manifest', () => {
    expect(read('login', 'meta', 'manifest.json')).not.toContain('fixture-password')
    expect(read('login', 'meta', 'summary.md')).not.toContain('fixture-password')
  })

  it('never writes the password into the log, not even in debug mode', () => {
    expect(outcome('login').output).not.toContain('fixture-password')
  })

  it('keeps the authenticated browser state out of the results', () => {
    expect(read('login', 'meta', 'manifest.json')).not.toContain('"cookies"')
    expect(has('login', 'storage-state.json')).toBe(false)
  })
})

describe('a login that does not reach the expected page', () => {
  it('stops with a workflow error', () => {
    expect(outcome('loginfail').exit).toBe(4)
  })

  it('names the step that failed', () => {
    const report = json('loginfail', 'meta', 'error.json')
    expect(report.error!.kind).toBe('workflow')
    expect(report.error!.message).toContain('a heading that the application does not have')
  })

  it('leaves nothing behind that looks like a finished analysis', () => {
    expect(has('loginfail', 'meta', 'manifest.json')).toBe(false)
    expect(has('loginfail', 'screen')).toBe(false)
    expect(has('loginfail', 'print')).toBe(false)
  })

  it('says in the summary that the capture failed', () => {
    const summary = read('loginfail', 'meta', 'summary.md')
    expect(summary).toContain('# Capture failed')
    expect(summary).toContain('No screenshots and no print output were kept')
  })

  it('keeps a debug screenshot of the state at the moment of the failure', () => {
    const report = json('loginfail', 'meta', 'error.json')
    expect(report.debug!.length).toBeGreaterThan(0)
    for (const path of report.debug!) expect(has('loginfail', ...path.split('/'))).toBe(true)
  })

  it('never writes the password into the error report or the log', () => {
    expect(read('loginfail', 'meta', 'error.json')).not.toContain('fixture-password')
    expect(outcome('loginfail').output).not.toContain('fixture-password')
  })
})

// -------------------------------------------------------------- the limits ---

describe('safety limits', () => {
  it('reports success but says what it could not cover', () => {
    expect(outcome('limits').exit).toBe(0)
    const manifest = json('limits', 'meta', 'manifest.json')
    expect(manifest.diagnostics.limits.length).toBeGreaterThan(0)
  })

  it('names each limit, what was wanted and what was captured', () => {
    const manifest = json('limits', 'meta', 'manifest.json')
    for (const limit of manifest.diagnostics.limits) {
      expect(limit.limit).toMatch(/^screenshots\./)
      expect(limit.wanted).toBeGreaterThan(limit.applied)
      expect(limit.where).toBeTruthy()
    }
  })

  it('actually honours the limit on the number of images', () => {
    const manifest = json('limits', 'meta', 'manifest.json')
    expect(screenshots(manifest).length).toBeLessThanOrEqual(3)
  })

  it('repeats the limits in the summary, where a reader will see them', () => {
    const summary = read('limits', 'meta', 'summary.md')
    expect(summary).toContain('Limits reached')
    expect(summary).toContain('The capture is incomplete')
  })

  it('says it in the log as well', () => {
    expect(outcome('limits').output).toMatch(/limit reached/)
  })
})

// ------------------------------------------------------- print stylesheets ---

describe('a document that brings its own paper size', () => {
  it('reports success', () => {
    expect(outcome('printcss').exit).toBe(0)
  })

  it('lets the document decide when it is allowed to', () => {
    const manifest = json('printcss', 'meta', 'manifest.json')
    const pdf = manifest.artifacts.find(item => item.type === 'pdf')!
    expect(pdf.preferCSSPageSize).toBe(true)
    const images = manifest.artifacts.filter(item => item.type === 'pdf-page-image')
    expect(images.length).toBeGreaterThan(0)
    // the page asks for A5 landscape, so it is wider than it is tall,
    // although A4 upright is configured
    for (const image of images) expect(image.image!.width).toBeGreaterThan(image.image!.height)
  })

  it('produces print output even with screenshots switched off', () => {
    expect(has('printcss', 'screen')).toBe(false)
    expect(has('printcss', 'print', 'pdf')).toBe(true)
  })
})

// ----------------------------------------------------------- failing early ---

describe('a configuration with a misspelled option', () => {
  it('stops with a configuration error', () => {
    expect(outcome('badconfig').exit).toBe(2)
  })

  it('names the option and lists the ones it knows', () => {
    expect(outcome('badconfig').output).toMatch(/scrollSeriess/)
    expect(outcome('badconfig').output).toMatch(/unknown option/)
  })

  it('writes nothing at all', () => {
    expect(has('badconfig', 'meta', 'manifest.json')).toBe(false)
    expect(has('badconfig', 'screen')).toBe(false)
  })
})

describe('an entry url that answers with an error page', () => {
  it('stops with a navigation error instead of reviewing the error page', () => {
    expect(outcome('notfound').exit).toBe(5)
    expect(outcome('notfound').output).toMatch(/answered http 404/)
  })

  it('leaves no results behind', () => {
    expect(has('notfound', 'meta', 'manifest.json')).toBe(false)
    expect(has('notfound', 'screen')).toBe(false)
  })

  it('records the failure for diagnosis', () => {
    const report = json('notfound', 'meta', 'error.json')
    expect(report.error!.kind).toBe('navigation')
    expect(report.error!.exitCode).toBe(5)
  })

  it('names the url of the request that went wrong, in the log itself', () => {
    // without the url a reader cannot tell which of a page's many requests
    // the warning is about, and has to open the manifest for every one
    expect(outcome('notfound').output).toContain('http://site:8080/does-not-exist.js')
  })
})

// ------------------------------------------------- stopped from outside ---

describe('a run that is stopped while it is capturing', () => {
  it('reports the abort with its own exit code', () => {
    expect(outcome('abort').exit).toBe(130)
  })

  it('calls it an abort in the log, never an internal error', () => {
    expect(outcome('abort').output).toMatch(/SIGTERM received/)
    expect(outcome('abort').output).toMatch(/stopped by SIGTERM/)
    expect(outcome('abort').output).not.toMatch(/internal error/)
  })

  it('records the abort as its own category, with the signal that caused it', () => {
    const report = json('abort', 'meta', 'error.json')
    expect(report.error!.kind).toBe('aborted')
    expect(report.error!.exitCode).toBe(130)
    expect(report.error!.message).toContain('SIGTERM')
  })

  it('leaves nothing behind that looks like a finished analysis', () => {
    expect(has('abort', 'meta', 'manifest.json')).toBe(false)
    expect(has('abort', 'screen')).toBe(false)
    expect(has('abort', 'print')).toBe(false)
  })

  it('says in the summary that the run was stopped, not that it broke', () => {
    const summary = read('abort', 'meta', 'summary.md')
    expect(summary).toContain('# Capture stopped')
    expect(summary).toContain('No screenshots and no print output were kept')
  })
})

// -------------------------------------------- configuration without a file ---

describe('a run configured entirely through the environment', () => {
  it('reports success', () => {
    expect(outcome('envonly').exit).toBe(0)
  })

  it('uses the viewports, formats and timings from the environment', () => {
    const manifest = json('envonly', 'meta', 'manifest.json')
    expect(manifest.viewports.map(item => item.name)).toEqual(['phone-small'])
    expect(manifest.viewports[0]!.width).toBe(360)
    const pdfs = manifest.artifacts.filter(item => item.type === 'pdf')
    expect(pdfs).toHaveLength(1)
    expect(pdfs[0]!.format).toBe('A5')
    expect(pdfs[0]!.orientation).toBe('landscape')
  })

  it('writes the effective configuration into the manifest', () => {
    const manifest = json('envonly', 'meta', 'manifest.json')
    const config = manifest.config as unknown as { stabilize: { settleMs: number }; outDir: string }
    expect(config.stabilize.settleMs).toBe(200)
    expect(config.outDir).toBe('/out')
  })
})
