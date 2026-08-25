/** Artifact file names.
 *
 * A name has to be readable on its own, because an analysis refers to files
 * by name in its findings. Every name therefore carries the viewport, its
 * dimensions, the capture type, the sequence number, the scroll position and,
 * for an inner scroll region, which region it belongs to and where the main
 * document stood while it was taken.
 */

export type CaptureType = 'viewport' | 'scroll' | 'fullpage' | 'region'

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const pad = (value: number, width: number): string =>
  String(Math.max(0, Math.round(value))).padStart(width, '0')

export interface ScreenshotNameParts {
  viewport: string
  width: number
  height: number
  capture: CaptureType
  sequence: number
  x: number
  y: number
  regionId?: string
  mainX?: number
  mainY?: number
}

export const screenshotName = (parts: ScreenshotNameParts): string => {
  const head = `${slug(parts.viewport)}-${parts.width}x${parts.height}-${parts.capture}-${pad(parts.sequence, 3)}`
  const position = `x${pad(parts.x, 5)}y${pad(parts.y, 5)}`
  if (parts.capture !== 'region') return `${head}-${position}.png`
  const main = `main-x${pad(parts.mainX ?? 0, 5)}y${pad(parts.mainY ?? 0, 5)}`
  return `${head}-${position}-${parts.regionId ?? 'r00'}-${main}.png`
}

export const pdfName = (format: string, orientation: string): string =>
  `${slug(format)}-${slug(orientation)}.pdf`

export const pdfPageName = (format: string, orientation: string, page: number): string =>
  `${slug(format)}-${slug(orientation)}-p${pad(page, 3)}.png`
