/** Scroll position arithmetic for a scrollable box.
 *
 * A series starts at the origin, advances by roughly the visible size minus a
 * small overlap so nothing falls between two shots, and always ends on the
 * exact last position — the bottom of a page is the part a reader judges a
 * design by, it must never be approximated away.
 */

export interface AxisOptions {
  /** visible size along the axis */
  viewport: number
  /** total scrollable size along the axis */
  content: number
  /** fraction of the visible size two neighbouring shots share, 0 .. 0.9 */
  overlap: number
  /** hard limit on positions per axis */
  maxSteps: number
}

export interface AxisResult {
  positions: number[]
  /** true when `maxSteps` cut the series short */
  limited: boolean
  /** how many positions the geometry would have needed */
  wanted: number
}

/** Distance between two consecutive shots. */
export const scrollStep = (viewport: number, overlap: number): number =>
  Math.max(1, Math.round(viewport * (1 - overlap)))

/** All positions of one axis, from 0 to the exact maximum offset. */
export const axisPositions = (options: AxisOptions): AxisResult => {
  const max = Math.max(0, Math.round(options.content - options.viewport))
  if (max <= 0) return { positions: [0], limited: false, wanted: 1 }

  const step = scrollStep(options.viewport, options.overlap)
  const all: number[] = [0]
  for (let position = step; position < max; position += step) all.push(position)
  all.push(max)

  const wanted = all.length
  if (wanted <= options.maxSteps) return { positions: all, limited: false, wanted }

  // keep the beginning of the series and never lose the exact end position
  const kept = all.slice(0, Math.max(1, options.maxSteps - 1))
  kept.push(max)
  return { positions: kept, limited: true, wanted }
}

/** Continue an already visited series after the content grew while scrolling.
 *
 * Lazy loading makes a document longer exactly while it is being captured.
 * The positions already shot stay as they are, the remaining ones are laid
 * out again from the last visited position with the new total size.
 */
export const extendAxisPositions = (visited: number[], options: AxisOptions): AxisResult => {
  const max = Math.max(0, Math.round(options.content - options.viewport))
  const last = visited.length > 0 ? Math.max(...visited) : 0
  if (max <= last) return { positions: [...visited], limited: false, wanted: visited.length }

  const step = scrollStep(options.viewport, options.overlap)
  const all = [...visited]
  for (let position = last + step; position < max; position += step) all.push(position)
  all.push(max)

  const unique = [...new Set(all)].sort((a, b) => a - b)
  const wanted = unique.length
  if (wanted <= options.maxSteps) return { positions: unique, limited: false, wanted }

  const kept = unique.slice(0, Math.max(1, options.maxSteps - 1))
  kept.push(max)
  return { positions: [...new Set(kept)], limited: true, wanted }
}

export interface GridOptions {
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
  overlap: number
  maxSteps: number
  /** hard limit on the number of shots of this one box */
  maxCells: number
}

export interface GridCell {
  x: number
  y: number
}

export interface GridResult {
  cells: GridCell[]
  limitedX: boolean
  limitedY: boolean
  limitedCells: boolean
  wantedCells: number
}

/** Every position of one scrollable box, in reading order (rows, then columns).
 *
 * Both axes of the *same* box are combined, because content hidden to the
 * right of a horizontally scrollable box is only visible at that combination.
 * Positions of *different*, independent boxes are never combined — see
 * `regions.ts`.
 */
export const scrollGrid = (options: GridOptions): GridResult => {
  const x = axisPositions({
    viewport: options.viewportWidth,
    content: options.contentWidth,
    overlap: options.overlap,
    maxSteps: options.maxSteps
  })
  const y = axisPositions({
    viewport: options.viewportHeight,
    content: options.contentHeight,
    overlap: options.overlap,
    maxSteps: options.maxSteps
  })

  const cells: GridCell[] = []
  for (const top of y.positions) for (const left of x.positions) cells.push({ x: left, y: top })

  const wantedCells = cells.length
  const limitedCells = wantedCells > options.maxCells
  return {
    cells: limitedCells ? cells.slice(0, options.maxCells) : cells,
    limitedX: x.limited,
    limitedY: y.limited,
    limitedCells,
    wantedCells
  }
}
