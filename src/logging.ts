/** Masked logging plus the diagnostics that end up in the manifest.
 *
 * Warnings and reached limits are not only printed, they are collected: the
 * manifest has to state what the run could not cover, otherwise a truncated
 * capture is indistinguishable from a complete one.
 */

import { SecretRegistry } from './secrets.js'

export type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LimitRecord {
  limit: string
  configured: number
  wanted: number
  applied: number
  where: string
}

export interface DiagnosticRecord {
  kind: 'console' | 'pageerror' | 'requestfailed' | 'httperror'
  viewport?: string
  text: string
  url?: string
  status?: number
}

export class Logger {
  readonly warnings: string[] = []
  readonly limits: LimitRecord[] = []
  readonly diagnostics: DiagnosticRecord[] = []

  constructor(
    private readonly secrets: SecretRegistry,
    private readonly level: Level = 'info'
  ) {}

  private emit(level: Level, message: string): void {
    if (ORDER[level] < ORDER[this.level]) return
    const line = `[${level}] ${this.secrets.mask(message)}`
    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`)
    else process.stdout.write(`${line}\n`)
  }

  debug(message: string): void {
    this.emit('debug', message)
  }

  info(message: string): void {
    this.emit('info', message)
  }

  warn(message: string): void {
    const masked = this.secrets.mask(message)
    this.warnings.push(masked)
    this.emit('warn', message)
  }

  error(message: string): void {
    this.emit('error', message)
  }

  /** A safety limit was hit — always visible, always in the manifest. */
  limit(record: LimitRecord): void {
    this.limits.push(record)
    this.emit(
      'warn',
      `limit reached: ${record.limit} (configured ${record.configured}, wanted ${record.wanted}, applied ${record.applied}) at ${record.where}`
    )
  }

  diagnostic(record: DiagnosticRecord): void {
    const masked: DiagnosticRecord = {
      ...record,
      text: this.secrets.mask(record.text),
      ...(record.url === undefined ? {} : { url: this.secrets.mask(record.url) })
    }
    this.diagnostics.push(masked)
    // the url belongs on the visible line: without it a reader cannot tell a
    // cancelled video from a stylesheet that never arrived, and would have to
    // open the manifest for every single warning
    this.emit(
      'warn',
      `${record.kind}${record.viewport ? ` [${record.viewport}]` : ''}: ${record.text}` +
        `${record.url === undefined ? '' : ` — ${record.url}`}`
    )
  }
}
