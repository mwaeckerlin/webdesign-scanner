/** Screenshot capture for one viewport.
 *
 * Four kinds of evidence are produced per viewport: what a visitor sees the
 * moment the page is ready, a series covering every scroll position of the
 * main document, one full page image, and one series per independently
 * scrollable inner region.
 *
 * Inner regions are captured one at a time — the other regions stay at their
 * initial offset. Combining the scroll positions of several independent
 * regions would multiply out into an unusable number of images without
 * showing anything the single series do not already show.
 */

import { join } from 'node:path'

import type { Page } from 'playwright'

import {
  REGION_ATTRIBUTE,
  detectScrollRegions,
  readDocumentMetrics,
  readRegion,
  resetRegions,
  scrollDocumentTo,
  scrollRegionTo,
  type Box,
  type RegionInfo
} from './browser-scripts.js'
import type { Config } from './config.js'
import type { Logger } from './logging.js'
import { readPngInfo } from './imageinfo.js'
import { screenshotName, type CaptureType } from './naming.js'
import { axisPositions, extendAxisPositions, scrollGrid } from './scroll.js'
import type { Viewport } from './viewports.js'

export interface RegionRef {
  id: string
  selector: string
  label: string
  depth: number
  box: Box
  scroll: { x: number; y: number }
}

export interface ScreenshotArtifact {
  type: 'screenshot'
  capture: CaptureType
  path: string
  viewport: string
  viewportWidth: number
  viewportHeight: number
  deviceScaleFactor: number
  sequence: number
  scroll: { x: number; y: number }
  mainScroll: { x: number; y: number } | null
  region: RegionRef | null
  image: { width: number; height: number; bytes: number }
}

/** Shared shot counter across all viewports, so a run cannot explode. */
export class ShotBudget {
  private total = 0

  constructor(
    private readonly maxTotal: number,
    private readonly logger: Logger
  ) {}

  get spent(): number {
    return this.total
  }

  take(where: string): boolean {
    if (this.total >= this.maxTotal) {
      this.logger.limit({
        limit: 'screenshots.maxShotsTotal',
        configured: this.maxTotal,
        wanted: this.total + 1,
        applied: this.total,
        where
      })
      return false
    }
    this.total += 1
    return true
  }
}

const screenshotOptions = (config: Config) => ({
  animations: config.stabilize.freezeAnimations ? ('disabled' as const) : ('allow' as const),
  caret: config.stabilize.hideCaret ? ('hide' as const) : ('initial' as const)
})

export interface CaptureContext {
  page: Page
  viewport: Viewport
  config: Config
  logger: Logger
  screenDir: string
  budget: ShotBudget
}

const record = (
  context: CaptureContext,
  file: string,
  capture: CaptureType,
  sequence: number,
  scroll: { x: number; y: number },
  mainScroll: { x: number; y: number } | null,
  region: RegionRef | null
): ScreenshotArtifact => ({
  type: 'screenshot',
  capture,
  path: join('screen', file),
  viewport: context.viewport.name,
  viewportWidth: context.viewport.width,
  viewportHeight: context.viewport.height,
  deviceScaleFactor: context.viewport.deviceScaleFactor,
  sequence,
  scroll,
  mainScroll,
  region,
  image: readPngInfo(join(context.screenDir, file))
})

/** Everything worth capturing for one viewport, in a stable order. */
export const captureViewport = async (context: CaptureContext): Promise<ScreenshotArtifact[]> => {
  const { page, viewport, config, logger } = context
  const artifacts: ScreenshotArtifact[] = []
  const perViewportLimit = config.screenshots.maxShotsPerViewport
  const options = screenshotOptions(config)

  // counted here rather than from `artifacts`: the helpers below collect
  // into their own list and would otherwise never reach the limit
  let taken = 0
  const allowed = (where: string): boolean => {
    if (taken >= perViewportLimit) {
      logger.limit({
        limit: 'screenshots.maxShotsPerViewport',
        configured: perViewportLimit,
        wanted: taken + 1,
        applied: taken,
        where
      })
      return false
    }
    if (!context.budget.take(where)) return false
    taken += 1
    return true
  }

  // 1. what a visitor sees the moment the page is ready
  if (config.screenshots.viewportShot) {
    const metrics = await page.evaluate(readDocumentMetrics)
    if (allowed(`${viewport.name}/viewport`)) {
      const file = screenshotName({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        capture: 'viewport',
        sequence: 0,
        x: metrics.scrollLeft,
        y: metrics.scrollTop
      })
      await page.screenshot({ path: join(context.screenDir, file), ...options })
      artifacts.push(record(context, file, 'viewport', 0, { x: metrics.scrollLeft, y: metrics.scrollTop }, null, null))
    }
  }

  // 2. the scroll series of the main document
  if (config.screenshots.scrollSeries) {
    artifacts.push(...(await captureMainScrollSeries(context, allowed)))
  }

  // 3. one full page image
  if (config.screenshots.fullPage) {
    await page.evaluate(scrollDocumentTo, { x: 0, y: 0 })
    const size = await page.evaluate(readDocumentMetrics)
    if (size.scrollHeight > config.screenshots.fullPageMaxHeight) {
      logger.limit({
        limit: 'screenshots.fullPageMaxHeight',
        configured: config.screenshots.fullPageMaxHeight,
        wanted: size.scrollHeight,
        applied: 0,
        where: `${viewport.name}/fullpage`
      })
    } else if (allowed(`${viewport.name}/fullpage`)) {
      const file = screenshotName({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        capture: 'fullpage',
        sequence: 0,
        x: 0,
        y: 0
      })
      try {
        await page.screenshot({ path: join(context.screenDir, file), fullPage: true, ...options })
        artifacts.push(record(context, file, 'fullpage', 0, { x: 0, y: 0 }, null, null))
      } catch (error) {
        logger.warn(`${viewport.name}: the full page image could not be produced: ${(error as Error).message}`)
      }
    }
  }

  // 4. one series per independently scrollable inner region
  if (config.screenshots.regions.enabled) {
    artifacts.push(...(await captureRegions(context, allowed)))
  }

  return artifacts
}

type Allowed = (where: string) => boolean

const captureMainScrollSeries = async (
  context: CaptureContext,
  allowed: Allowed
): Promise<ScreenshotArtifact[]> => {
  const { page, viewport, config, logger } = context
  const artifacts: ScreenshotArtifact[] = []
  const options = screenshotOptions(config)

  await page.evaluate(scrollDocumentTo, { x: 0, y: 0 })
  let metrics = await page.evaluate(readDocumentMetrics)

  const horizontal = axisPositions({
    viewport: metrics.clientWidth,
    content: metrics.scrollWidth,
    overlap: config.screenshots.overlap,
    maxSteps: config.screenshots.maxStepsPerAxis
  })
  if (horizontal.limited) {
    logger.limit({
      limit: 'screenshots.maxStepsPerAxis',
      configured: config.screenshots.maxStepsPerAxis,
      wanted: horizontal.wanted,
      applied: horizontal.positions.length,
      where: `${viewport.name}/scroll-x`
    })
  }

  let vertical = axisPositions({
    viewport: metrics.clientHeight,
    content: metrics.scrollHeight,
    overlap: config.screenshots.overlap,
    maxSteps: config.screenshots.maxStepsPerAxis
  })
  if (vertical.limited) {
    logger.limit({
      limit: 'screenshots.maxStepsPerAxis',
      configured: config.screenshots.maxStepsPerAxis,
      wanted: vertical.wanted,
      applied: vertical.positions.length,
      where: `${viewport.name}/scroll-y`
    })
  }

  let knownHeight = metrics.scrollHeight
  const visited: number[] = []
  // the capture type is part of the name, so every series counts from zero
  let sequence = 0
  let index = 0

  while (index < vertical.positions.length) {
    const y = vertical.positions[index]!
    for (const x of horizontal.positions) {
      const actual = await page.evaluate(scrollDocumentTo, { x, y })
      await page.waitForTimeout(config.stabilize.scrollSettleMs)
      if (!allowed(`${viewport.name}/scroll`)) return artifacts
      const file = screenshotName({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        capture: 'scroll',
        sequence,
        x: actual.x,
        y: actual.y
      })
      await page.screenshot({ path: join(context.screenDir, file), ...options })
      artifacts.push(record(context, file, 'scroll', sequence, actual, null, null))
      sequence += 1
    }
    visited.push(y)

    // lazy loading can make the document longer while it is being captured
    metrics = await page.evaluate(readDocumentMetrics)
    if (metrics.scrollHeight > knownHeight) {
      knownHeight = metrics.scrollHeight
      const extended = extendAxisPositions(visited, {
        viewport: metrics.clientHeight,
        content: metrics.scrollHeight,
        overlap: config.screenshots.overlap,
        maxSteps: config.screenshots.maxStepsPerAxis
      })
      if (extended.limited) {
        logger.limit({
          limit: 'screenshots.maxStepsPerAxis',
          configured: config.screenshots.maxStepsPerAxis,
          wanted: extended.wanted,
          applied: extended.positions.length,
          where: `${viewport.name}/scroll-y-lazy`
        })
      }
      vertical = extended
      logger.debug(`${viewport.name}: document grew to ${metrics.scrollHeight}, scroll series extended`)
    }
    index += 1
  }

  return artifacts
}

const captureRegions = async (context: CaptureContext, allowed: Allowed): Promise<ScreenshotArtifact[]> => {
  const { page, viewport, config, logger } = context
  const settings = config.screenshots.regions
  const artifacts: ScreenshotArtifact[] = []
  const options = screenshotOptions(config)

  await page.evaluate(scrollDocumentTo, { x: 0, y: 0 })
  const scan = await page.evaluate(detectScrollRegions, {
    attribute: REGION_ATTRIBUTE,
    minWidth: settings.minWidth,
    minHeight: settings.minHeight,
    maxRegions: settings.maxRegions,
    maxDepth: settings.maxDepth,
    tolerance: 4
  })

  if (scan.tooDeep > 0) {
    logger.limit({
      limit: 'screenshots.regions.maxDepth',
      configured: settings.maxDepth,
      wanted: scan.found,
      applied: scan.found - scan.tooDeep,
      where: `${viewport.name}/regions`
    })
  }
  if (scan.found - scan.tooDeep > scan.regions.length) {
    logger.limit({
      limit: 'screenshots.regions.maxRegions',
      configured: settings.maxRegions,
      wanted: scan.found - scan.tooDeep,
      applied: scan.regions.length,
      where: `${viewport.name}/regions`
    })
  }
  if (scan.regions.length === 0) {
    logger.debug(`${viewport.name}: no independently scrollable inner region found`)
    return artifacts
  }
  logger.info(`${viewport.name}: ${scan.regions.length} inner scroll region(s) detected`)

  const initial = scan.regions.map(region => ({ id: region.id, x: region.scrollLeft, y: region.scrollTop }))

  for (const region of scan.regions) {
    await page.evaluate(resetRegions, { attribute: REGION_ATTRIBUTE, offsets: initial })

    const grid = scrollGrid({
      viewportWidth: region.clientWidth,
      viewportHeight: region.clientHeight,
      contentWidth: region.scrollWidth,
      contentHeight: region.scrollHeight,
      overlap: config.screenshots.overlap,
      maxSteps: config.screenshots.maxStepsPerAxis,
      maxCells: settings.maxShotsPerRegion
    })
    if (grid.limitedCells) {
      logger.limit({
        limit: 'screenshots.regions.maxShotsPerRegion',
        configured: settings.maxShotsPerRegion,
        wanted: grid.wantedCells,
        applied: grid.cells.length,
        where: `${viewport.name}/${region.id}`
      })
    }

    const locator = page.locator(`[${REGION_ATTRIBUTE}="${region.id}"]`)
    let sequence = 0
    for (const cell of grid.cells) {
      const actual = await page.evaluate(scrollRegionTo, {
        attribute: REGION_ATTRIBUTE,
        id: region.id,
        x: cell.x,
        y: cell.y
      })
      if (actual === null) {
        logger.warn(`${viewport.name}: region ${region.id} disappeared while capturing`)
        break
      }
      await page.waitForTimeout(config.stabilize.scrollSettleMs)
      if (!allowed(`${viewport.name}/${region.id}`)) return artifacts

      const main = await page.evaluate(readDocumentMetrics)
      const file = screenshotName({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        capture: 'region',
        sequence,
        x: actual.x,
        y: actual.y,
        regionId: region.id,
        mainX: main.scrollLeft,
        mainY: main.scrollTop
      })
      try {
        await locator.screenshot({ path: join(context.screenDir, file), ...options })
      } catch (error) {
        logger.warn(`${viewport.name}: region ${region.id} could not be captured: ${(error as Error).message}`)
        break
      }
      const after = await page.evaluate(readDocumentMetrics)
      const geometry = (await page.evaluate(readRegion, { attribute: REGION_ATTRIBUTE, id: region.id })) ?? region
      artifacts.push(
        record(
          context,
          file,
          'region',
          sequence,
          actual,
          { x: after.scrollLeft, y: after.scrollTop },
          regionRef(region, geometry, actual)
        )
      )
      sequence += 1
    }
  }

  await page.evaluate(resetRegions, { attribute: REGION_ATTRIBUTE, offsets: initial })
  return artifacts
}

const regionRef = (region: RegionInfo, geometry: RegionInfo, scroll: { x: number; y: number }): RegionRef => ({
  id: region.id,
  selector: region.selector,
  label: region.label,
  depth: region.depth,
  box: geometry.box,
  scroll
})
