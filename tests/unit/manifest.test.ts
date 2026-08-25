import { describe, expect, it } from 'vitest'

import type { ScreenshotArtifact } from '../../src/capture.js'
import { loadConfig } from '../../src/config.js'
import {
  buildFailure,
  buildFailureSummary,
  buildManifest,
  buildSummary,
  type FailureReport,
  type RunReport
} from '../../src/manifest.js'
import { SecretRegistry } from '../../src/secrets.js'
import { expandViewports } from '../../src/viewports.js'

const config = loadConfig({ TARGET_URL: 'https://example.com', VIEWPORTS: 'hd' })
const viewports = expandViewports(
  [{ name: 'hd', width: 1280, height: 720, kind: 'desktop' }],
  { derived: true, minDerivedWidth: 320 }
)

const shot: ScreenshotArtifact = {
  type: 'screenshot',
  capture: 'scroll',
  path: 'screen/hd-1280x720-scroll-001-x00000y00648.png',
  viewport: 'hd',
  viewportWidth: 1280,
  viewportHeight: 720,
  deviceScaleFactor: 1,
  sequence: 1,
  scroll: { x: 0, y: 648 },
  mainScroll: null,
  region: null,
  image: { width: 1280, height: 720, bytes: 4711 }
}

const report: RunReport = {
  startedAt: '2026-08-14T08:00:00.000Z',
  finishedAt: '2026-08-14T08:00:42.000Z',
  durationMs: 42000,
  browserSandbox: false,
  requestedUrl: 'https://example.com/login',
  finalUrl: 'https://example.com/app',
  title: 'Dashboard',
  config,
  viewports,
  workflow: {
    file: '/etc/wds/workflow.yaml',
    name: 'login',
    version: 1,
    status: 'completed',
    runs: [{ viewport: 'hd', status: 'completed', steps: [{ index: 0, action: 'fill', label: 'password', status: 'ok', durationMs: 12 }] }]
  },
  artifacts: [
    shot,
    {
      type: 'pdf',
      path: 'print/pdf/a4-portrait.pdf',
      format: 'A4',
      orientation: 'portrait',
      pages: 3,
      scale: 1,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      bytes: 9999
    },
    {
      type: 'pdf-page-image',
      path: 'print/png/a4-portrait-p001.png',
      format: 'A4',
      orientation: 'portrait',
      page: 1,
      dpi: 150,
      image: { width: 1240, height: 1754, bytes: 8888 }
    }
  ],
  warnings: ['the page still had background requests'],
  limits: [{ limit: 'screenshots.maxStepsPerAxis', configured: 2, wanted: 7, applied: 2, where: 'hd/scroll-y' }],
  diagnostics: [{ kind: 'console', viewport: 'hd', text: 'deprecation warning' }]
}

describe('the manifest', () => {
  it('names the tool and the manifest format', () => {
    const manifest = buildManifest(report) as Record<string, Record<string, unknown>>
    expect(manifest.manifestVersion).toBe(1)
    expect(manifest.tool!.name).toBe('@mwaeckerlin/webdesign-scanner')
    expect(manifest.tool!.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('states the requested and the final url, the title and the time', () => {
    const manifest = buildManifest(report) as Record<string, Record<string, unknown>>
    expect(manifest.target!.requestedUrl).toBe('https://example.com/login')
    expect(manifest.target!.finalUrl).toBe('https://example.com/app')
    expect(manifest.target!.title).toBe('Dashboard')
    expect(manifest.run!.startedAt).toBe('2026-08-14T08:00:00.000Z')
    expect(manifest.run!.durationMs).toBe(42000)
    expect(manifest.run!.status).toBe('ok')
  })

  it('records whether the browser had its own sandbox', () => {
    const manifest = buildManifest(report) as Record<string, Record<string, unknown>>
    expect(manifest.run!.browserSandbox).toBe(false)
    expect(buildSummary(report)).toContain('the container is the isolation boundary')
  })

  it('carries the effective configuration, so the run can be repeated', () => {
    const manifest = buildManifest(report) as Record<string, unknown>
    expect(manifest.config).toBe(config)
  })

  it('lists every viewport with its dimensions and where a part width came from', () => {
    const manifest = buildManifest(report) as Record<string, unknown>
    const list = manifest.viewports as Array<Record<string, unknown>>
    expect(list.map(item => item.name)).toEqual(['hd', 'hd-half'])
    expect(list[1]!.derivedFrom).toBe('hd')
    expect(list[1]!.width).toBe(640)
  })

  it('records the workflow status per viewport', () => {
    const manifest = buildManifest(report) as Record<string, Record<string, unknown>>
    expect(manifest.workflow!.status).toBe('completed')
    expect((manifest.workflow!.runs as unknown[])).toHaveLength(1)
  })

  it('describes every artifact with its type, position and pixel size', () => {
    const manifest = buildManifest(report) as Record<string, unknown>
    const artifacts = manifest.artifacts as Array<Record<string, unknown>>
    expect(artifacts).toHaveLength(3)
    expect(artifacts[0]!.path).toBe('screen/hd-1280x720-scroll-001-x00000y00648.png')
    expect(artifacts[0]!.scroll).toEqual({ x: 0, y: 648 })
    expect(artifacts[0]!.image).toEqual({ width: 1280, height: 720, bytes: 4711 })
    expect(artifacts[1]!.pages).toBe(3)
    expect(artifacts[2]!.page).toBe(1)
  })

  it('names every warning and every limit that applied', () => {
    const manifest = buildManifest(report) as Record<string, Record<string, unknown>>
    expect(manifest.diagnostics!.warnings).toHaveLength(1)
    expect((manifest.diagnostics!.limits as unknown[])).toHaveLength(1)
    expect((manifest.diagnostics!.pageEvents as unknown[])).toHaveLength(1)
  })

  it('never carries a secret', () => {
    const secrets = new SecretRegistry()
    secrets.add('example.com')
    const masked = JSON.stringify(secrets.maskDeep(buildManifest(report)))
    expect(masked).not.toContain('example.com')
  })
})

describe('the human readable summary', () => {
  const summary = buildSummary(report)

  it('says what was captured and where the manifest is', () => {
    expect(summary).toContain('https://example.com/login')
    expect(summary).toContain('https://example.com/app')
    expect(summary).toContain('meta/manifest.json')
  })

  it('counts the artifacts by kind', () => {
    expect(summary).toContain('1 screenshot(s)')
    expect(summary).toContain('1 print pdf(s) with 1 rendered page image(s)')
  })

  it('lists the viewports with their dimensions', () => {
    expect(summary).toContain('1280x720')
    expect(summary).toContain('640x720')
  })

  it('says that the numbers are css pixels, not window sizes', () => {
    expect(summary).toContain('css pixels of the layout viewport')
  })

  it('makes an incomplete capture visible instead of hiding it', () => {
    expect(summary).toContain('Limits reached')
    expect(summary).toContain('screenshots.maxStepsPerAxis')
    expect(summary).toContain('The capture is incomplete')
  })

  it('repeats the warnings and the problems the page had', () => {
    expect(summary).toContain('background requests')
    expect(summary).toContain('deprecation warning')
  })

  it('says what the material is good for and what it needs', () => {
    expect(summary).toContain('audience, task, main action')
  })
})

describe('the report of a failed run', () => {
  const failure: FailureReport = {
    startedAt: '2026-08-14T08:00:00.000Z',
    failedAt: '2026-08-14T08:00:07.000Z',
    requestedUrl: 'https://example.com/login',
    kind: 'workflow',
    exitCode: 4,
    message: 'workflow step 5 (submit) failed',
    details: { step: 5 },
    workflow: { file: '/etc/wds/workflow.yaml', name: 'login', version: 1, status: 'failed', runs: [] },
    debugFiles: ['debug/failure-page-01.png'],
    warnings: [],
    limits: [],
    diagnostics: []
  }

  it('states the category and the exit code', () => {
    const report = buildFailure(failure) as Record<string, Record<string, unknown>>
    expect(report.run!.status).toBe('failed')
    expect(report.error!.kind).toBe('workflow')
    expect(report.error!.exitCode).toBe(4)
  })

  it('points at the debug screenshots', () => {
    const report = buildFailure(failure) as Record<string, unknown>
    expect(report.debug).toEqual(['debug/failure-page-01.png'])
  })

  it('says in plain words that nothing was kept', () => {
    const summary = buildFailureSummary(failure)
    expect(summary).toContain('Capture failed')
    expect(summary).toContain('No screenshots and no print output were kept')
    expect(summary).toContain('debug/failure-page-01.png')
  })
})
