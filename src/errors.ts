/** Typed failures with a stable exit code per category.
 *
 * The exit code is part of the tool's contract: a one-shot job in a pipeline
 * must be able to tell a broken configuration from a site that did not load.
 */

export const EXIT = {
  ok: 0,
  config: 2,
  output: 3,
  workflow: 4,
  navigation: 5,
  rendering: 6,
  /** stopped from outside, by ctrl-c or by a container being shut down */
  aborted: 130,
  internal: 1
} as const

export type ExitName = keyof typeof EXIT

export class ScannerError extends Error {
  readonly kind: ExitName
  readonly details: Record<string, unknown>

  constructor(kind: ExitName, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ScannerError'
    this.kind = kind
    this.details = details
  }

  get exitCode(): number {
    return EXIT[this.kind]
  }
}

export const configError = (message: string, details?: Record<string, unknown>) =>
  new ScannerError('config', message, details)

export const outputError = (message: string, details?: Record<string, unknown>) =>
  new ScannerError('output', message, details)

export const workflowError = (message: string, details?: Record<string, unknown>) =>
  new ScannerError('workflow', message, details)

export const navigationError = (message: string, details?: Record<string, unknown>) =>
  new ScannerError('navigation', message, details)

export const renderingError = (message: string, details?: Record<string, unknown>) =>
  new ScannerError('rendering', message, details)

export const abortedError = (signal: string) =>
  new ScannerError(
    'aborted',
    `the run was stopped by ${signal} before it finished, so nothing was captured completely`,
    { signal }
  )

/** Turn whatever was thrown into a typed failure.
 *
 * A signal outranks everything else. Stopping the run kills the browser, and
 * whichever call was in flight rejects with a message about a closed page —
 * that rejection is a consequence of the abort, never its cause. Reporting it
 * as an internal error would send a reader hunting a defect that is not there.
 */
export const classifyFailure = (error: unknown, signal: string | null): ScannerError => {
  if (signal !== null) return abortedError(signal)
  if (error instanceof ScannerError) return error
  return new ScannerError('internal', String(error))
}
