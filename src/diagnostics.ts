/** Page level problems observed while a viewport is being captured.
 *
 * A design review needs to know whether what it sees is the intended page or
 * a page with a broken stylesheet, a failed font request or a script that
 * died halfway through building the layout.
 */

import type { Page } from 'playwright'

import type { Logger } from './logging.js'

export interface DiagnosticsHandle {
  detach: () => void
  pageErrors: number
  httpErrors: number
}

export const observePage = (page: Page, logger: Logger, viewport: string, captureConsole: boolean): DiagnosticsHandle => {
  const handle: DiagnosticsHandle = { detach: () => undefined, pageErrors: 0, httpErrors: 0 }

  const onConsole = (message: { type: () => string; text: () => string }): void => {
    if (message.type() !== 'error') return
    logger.diagnostic({ kind: 'console', viewport, text: message.text() })
  }
  const onPageError = (error: Error): void => {
    handle.pageErrors += 1
    logger.diagnostic({ kind: 'pageerror', viewport, text: `${error.name}: ${error.message}` })
  }
  const onRequestFailed = (request: { url: () => string; failure: () => { errorText: string } | null }): void => {
    logger.diagnostic({
      kind: 'requestfailed',
      viewport,
      text: request.failure()?.errorText ?? 'request failed',
      url: request.url()
    })
  }
  const onResponse = (response: { status: () => number; url: () => string }): void => {
    if (response.status() < 400) return
    handle.httpErrors += 1
    logger.diagnostic({
      kind: 'httperror',
      viewport,
      text: `http ${response.status()}`,
      url: response.url(),
      status: response.status()
    })
  }

  if (captureConsole) page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  handle.detach = () => {
    if (captureConsole) page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
    page.off('response', onResponse)
  }
  return handle
}
