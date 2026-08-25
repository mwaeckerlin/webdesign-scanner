/** Bringing a page into a reproducible state before anything is captured.
 *
 * Two runs of the same tool against the same site must produce comparable
 * images, otherwise a before/after comparison measures noise. Fonts have to
 * be there (a fallback font changes every line break), animations and the
 * text caret have to stand still, and lazily loaded content has to exist
 * before the document height is measured.
 */

import type { Page } from 'playwright'

import { readDocumentMetrics, scrollDocumentTo, waitForFonts } from './browser-scripts.js'
import type { Config } from './config.js'
import type { Logger } from './logging.js'
import { axisPositions } from './scroll.js'

const FREEZE_STYLE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`

const HIDE_CARET_STYLE = `
  * { caret-color: transparent !important; }
`

/** Wait for the network to go quiet, but never wait forever.
 *
 * A page with an open WebSocket or with polling never reaches network idle.
 * That is normal and no reason to fail the run — the timeout is recorded as a
 * warning so the manifest shows that the page was still busy.
 */
export const settleNetwork = async (page: Page, config: Config, logger: Logger, label: string): Promise<void> => {
  if (!config.stabilize.networkIdle) return
  try {
    await page.waitForLoadState('networkidle', { timeout: config.stabilize.networkIdleTimeout })
  } catch {
    logger.warn(
      `${label}: the page still had background requests after ${config.stabilize.networkIdleTimeout} ms (websocket or polling), captured anyway`
    )
  }
}

/** Scroll the whole document once to trigger lazy loading, then return to the top. */
export const preScroll = async (page: Page, config: Config): Promise<void> => {
  if (!config.stabilize.preScroll) return
  const metrics = await page.evaluate(readDocumentMetrics)
  const steps = axisPositions({
    viewport: metrics.clientHeight,
    content: metrics.scrollHeight,
    overlap: config.screenshots.overlap,
    maxSteps: config.screenshots.maxStepsPerAxis
  })
  for (const y of steps.positions) {
    await page.evaluate(scrollDocumentTo, { x: 0, y })
    await page.waitForTimeout(config.stabilize.scrollSettleMs)
  }
  await page.evaluate(scrollDocumentTo, { x: 0, y: 0 })
  await page.waitForTimeout(config.stabilize.scrollSettleMs)
}

/** Everything that has to happen between "page is there" and "take pictures". */
export const stabilize = async (page: Page, config: Config, logger: Logger, label: string): Promise<void> => {
  await settleNetwork(page, config, logger, label)

  if (config.stabilize.fonts) {
    try {
      await page.evaluate(waitForFonts)
    } catch (error) {
      logger.warn(`${label}: waiting for webfonts failed: ${(error as Error).message}`)
    }
  }

  if (config.stabilize.freezeAnimations) await page.addStyleTag({ content: FREEZE_STYLE })
  if (config.stabilize.hideCaret) await page.addStyleTag({ content: HIDE_CARET_STYLE })

  if (config.stabilize.settleMs > 0) await page.waitForTimeout(config.stabilize.settleMs)
}
