/** The machine readable manifest and the human readable summary.
 *
 * The manifest is the index an analysis works from: it maps every file to the
 * state it shows. It exists only for a successful run — a failed run writes
 * an error report instead, so a result directory can never be mistaken for a
 * complete capture of the target page.
 *
 * Neither file ever carries a secret or an authenticated browser state: both
 * are written through the secret registry.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ScreenshotArtifact } from './capture.js'
import type { Config } from './config.js'
import type { DiagnosticRecord, LimitRecord } from './logging.js'
import type { PrintArtifact } from './print.js'
import type { SecretRegistry } from './secrets.js'
import { TOOL_NAME, TOOL_VERSION } from './version.js'
import type { Viewport } from './viewports.js'
import type { StepResult } from './workflow-run.js'

export type Artifact = ScreenshotArtifact | PrintArtifact

export interface WorkflowRun {
  viewport: string
  status: 'completed'
  steps: StepResult[]
}

export interface WorkflowSummary {
  file: string
  name: string
  version: number
  status: 'completed' | 'failed'
  /** one entry per viewport: the workflow is replayed for every one of them */
  runs: WorkflowRun[]
}

export interface RunReport {
  startedAt: string
  finishedAt: string
  durationMs: number
  /** whether the browser ran with its own sandbox on top of the container */
  browserSandbox: boolean
  requestedUrl: string
  finalUrl: string
  title: string
  config: Config
  viewports: Viewport[]
  workflow: WorkflowSummary | null
  artifacts: Artifact[]
  warnings: string[]
  limits: LimitRecord[]
  diagnostics: DiagnosticRecord[]
}

export const buildManifest = (report: RunReport): Record<string, unknown> => ({
  manifestVersion: 1,
  tool: { name: TOOL_NAME, version: TOOL_VERSION },
  run: {
    status: 'ok',
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    durationMs: report.durationMs,
    browserSandbox: report.browserSandbox
  },
  target: {
    requestedUrl: report.requestedUrl,
    finalUrl: report.finalUrl,
    title: report.title
  },
  config: report.config,
  workflow: report.workflow,
  viewports: report.viewports,
  artifacts: report.artifacts,
  diagnostics: {
    warnings: report.warnings,
    limits: report.limits,
    pageEvents: report.diagnostics
  }
})

const countBy = (artifacts: Artifact[], predicate: (artifact: Artifact) => boolean): number =>
  artifacts.filter(predicate).length

const table = (rows: string[][]): string => {
  const header = rows[0]!
  const body = rows.slice(1)
  const line = `| ${header.join(' | ')} |`
  const rule = `| ${header.map(() => '---').join(' | ')} |`
  return [line, rule, ...body.map(row => `| ${row.join(' | ')} |`)].join('\n')
}

export const buildSummary = (report: RunReport): string => {
  const screenshots = report.artifacts.filter(item => item.type === 'screenshot') as ScreenshotArtifact[]
  const pdfs = countBy(report.artifacts, item => item.type === 'pdf')
  const pdfPages = countBy(report.artifacts, item => item.type === 'pdf-page-image')

  const viewportRows: string[][] = [
    ['viewport', 'css pixels', 'scale', 'kind', 'derived from', 'shots']
  ]
  for (const viewport of report.viewports) {
    viewportRows.push([
      viewport.name + (viewport.aliases.length > 0 ? ` (= ${viewport.aliases.join(', ')})` : ''),
      `${viewport.width}x${viewport.height}`,
      `${viewport.deviceScaleFactor}x`,
      viewport.kind,
      viewport.derivedFrom ? `${viewport.derivedFrom} ${viewport.fraction}` : '—',
      String(screenshots.filter(shot => shot.viewport === viewport.name).length)
    ])
  }

  const lines: string[] = [
    '# Capture summary',
    '',
    `- **Requested url:** ${report.requestedUrl}`,
    `- **Final url:** ${report.finalUrl}`,
    `- **Page title:** ${report.title}`,
    `- **Started:** ${report.startedAt}`,
    `- **Duration:** ${(report.durationMs / 1000).toFixed(1)} s`,
    `- **Workflow:** ${report.workflow ? `${report.workflow.name} (${report.workflow.status})` : 'none'}`,
    `- **Browser sandbox:** ${report.browserSandbox ? 'on' : 'off, the container is the isolation boundary'}`,
    '',
    '## Artifacts',
    '',
    `- ${screenshots.length} screenshot(s): ` +
      `${countBy(screenshots, item => (item as ScreenshotArtifact).capture === 'viewport')} first view, ` +
      `${countBy(screenshots, item => (item as ScreenshotArtifact).capture === 'scroll')} scroll, ` +
      `${countBy(screenshots, item => (item as ScreenshotArtifact).capture === 'fullpage')} full page, ` +
      `${countBy(screenshots, item => (item as ScreenshotArtifact).capture === 'region')} inner scroll region`,
    `- ${pdfs} print pdf(s) with ${pdfPages} rendered page image(s)`,
    `- Manifest: \`meta/manifest.json\``,
    '',
    '## Viewports',
    '',
    table(viewportRows),
    '',
    'All dimensions are css pixels of the layout viewport, not the outer size of a browser window.'
  ]

  if (report.limits.length > 0) {
    lines.push('', '## Limits reached', '')
    for (const limit of report.limits) {
      lines.push(
        `- \`${limit.limit}\` at ${limit.where}: wanted ${limit.wanted}, captured ${limit.applied} (configured ${limit.configured})`
      )
    }
    lines.push('', 'The capture is incomplete where a limit applied. Raise the limit and run again to cover it.')
  }

  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '')
    for (const warning of report.warnings) lines.push(`- ${warning}`)
  }

  if (report.diagnostics.length > 0) {
    lines.push('', '## Page problems', '')
    for (const item of report.diagnostics.slice(0, 50)) {
      lines.push(`- ${item.kind}${item.viewport ? ` [${item.viewport}]` : ''}: ${item.text}`)
    }
    if (report.diagnostics.length > 50) {
      lines.push(`- … and ${report.diagnostics.length - 50} more, see the manifest`)
    }
  }

  lines.push(
    '',
    '## Next step',
    '',
    'Feed the images together with the context template and the analysis prompt from the',
    'project README to ChatGPT or Claude. Without audience, task, main action and the',
    'intended order of attention, an analysis can judge visual consistency but not',
    'effectiveness.',
    ''
  )
  return lines.join('\n')
}

export const writeManifest = (outDir: string, report: RunReport, secrets: SecretRegistry): void => {
  const manifest = secrets.maskDeep(buildManifest(report))
  writeFileSync(join(outDir, 'meta', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  writeFileSync(join(outDir, 'meta', 'summary.md'), secrets.mask(buildSummary(report)), 'utf8')
}

export interface FailureReport {
  startedAt: string
  failedAt: string
  requestedUrl: string
  kind: string
  exitCode: number
  message: string
  details: Record<string, unknown>
  workflow: WorkflowSummary | null
  debugFiles: string[]
  warnings: string[]
  limits: LimitRecord[]
  diagnostics: DiagnosticRecord[]
}

export const buildFailure = (report: FailureReport): Record<string, unknown> => ({
  manifestVersion: 1,
  tool: { name: TOOL_NAME, version: TOOL_VERSION },
  run: { status: 'failed', startedAt: report.startedAt, failedAt: report.failedAt },
  target: { requestedUrl: report.requestedUrl },
  error: { kind: report.kind, exitCode: report.exitCode, message: report.message, details: report.details },
  workflow: report.workflow,
  debug: report.debugFiles,
  diagnostics: { warnings: report.warnings, limits: report.limits, pageEvents: report.diagnostics }
})

export const buildFailureSummary = (report: FailureReport): string =>
  [
    // an interruption is not a defect, and a heading that called it one would
    // send a reader looking for a problem with the page or with the tool
    report.kind === 'aborted' ? '# Capture stopped' : '# Capture failed',
    '',
    `- **Requested url:** ${report.requestedUrl}`,
    `- **${report.kind === 'aborted' ? 'Stopped' : 'Failed'} at:** ${report.failedAt}`,
    `- **Category:** ${report.kind} (exit code ${report.exitCode})`,
    `- **Reason:** ${report.message}`,
    '',
    'No screenshots and no print output were kept: an incomplete capture must not be',
    'mistaken for an analysis of the target page.',
    '',
    report.debugFiles.length > 0
      ? `Debug screenshots of the state at the moment of the failure:\n\n${report.debugFiles.map(file => `- \`${file}\``).join('\n')}`
      : report.kind === 'aborted'
        ? 'No debug screenshot is kept: the run was interrupted, not broken.'
        : 'No debug screenshot could be taken.',
    '',
    ...(report.warnings.length > 0 ? ['## Warnings', '', ...report.warnings.map(warning => `- ${warning}`), ''] : []),
    ...(report.diagnostics.length > 0
      ? ['## Page problems', '', ...report.diagnostics.slice(0, 50).map(item => `- ${item.kind}: ${item.text}`), '']
      : [])
  ].join('\n')

export const writeFailure = (outDir: string, report: FailureReport, secrets: SecretRegistry): void => {
  const failure = secrets.maskDeep(buildFailure(report))
  writeFileSync(join(outDir, 'meta', 'error.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
  writeFileSync(join(outDir, 'meta', 'summary.md'), secrets.mask(buildFailureSummary(report)), 'utf8')
}
