/** Viewport catalogue, derived part widths and deduplication.
 *
 * All numbers are CSS pixels of the layout viewport — not the outer size of a
 * browser window, which additionally carries the browser chrome (tab strip,
 * address bar, scrollbars). A real 1920x1080 monitor therefore shows clearly
 * less than the `full-hd` viewport listed here.
 */

export type ViewportKind = 'desktop' | 'tablet' | 'phone'

export interface ViewportSpec {
  name: string
  width: number
  height: number
  kind: ViewportKind
  deviceScaleFactor?: number
  isMobile?: boolean
  hasTouch?: boolean
  /** documentation only: what the entry stands for */
  note?: string
}

export interface Viewport {
  name: string
  width: number
  height: number
  kind: ViewportKind
  deviceScaleFactor: number
  isMobile: boolean
  hasTouch: boolean
  /** name of the full-width viewport a part width was derived from */
  derivedFrom: string | null
  /** the fraction of the parent width, e.g. `1/2` */
  fraction: string | null
  /** names of duplicates that resolved to exactly this rendering */
  aliases: string[]
  note: string
}

/** Aspect ratio at or above which the extra 1/3 and 2/3 widths are produced. */
export const ULTRAWIDE_ASPECT = 2

/** Part widths never fall below this, a narrower window is not realistic. */
export const MIN_DERIVED_WIDTH = 320

const DEFAULT_SCALE: Record<ViewportKind, number> = { desktop: 1, tablet: 2, phone: 2 }

/** The built-in catalogue. Order matters: the first entry wins a duplicate. */
export const BUILTIN_VIEWPORTS: ViewportSpec[] = [
  { name: 'desktop-4-3', width: 1024, height: 768, kind: 'desktop', note: 'classic 4:3 desktop' },
  { name: 'hd', width: 1280, height: 720, kind: 'desktop', note: 'HD / 720p, 16:9' },
  { name: 'desktop-16-10', width: 1440, height: 900, kind: 'desktop', note: '16:10 notebook' },
  { name: 'desktop-16-9', width: 1600, height: 900, kind: 'desktop', note: '16:9 desktop' },
  { name: 'full-hd', width: 1920, height: 1080, kind: 'desktop', note: 'Full HD / 1080p, 16:9' },
  // two sizes, because they sit on opposite sides of the breakpoint a
  // responsive layout typically places around 2560: the entry size shows the
  // narrow branch, the common one the wide branch
  { name: 'desktop-21-9-fhd', width: 2560, height: 1080, kind: 'desktop', note: '21:9 ultrawide, entry size' },
  { name: 'desktop-21-9', width: 3440, height: 1440, kind: 'desktop', note: '21:9 ultrawide, the common size' },
  { name: 'uhd', width: 3840, height: 2160, kind: 'desktop', note: 'UHD / 4K, 16:9' },
  { name: 'tablet-portrait', width: 768, height: 1024, kind: 'tablet', note: 'tablet upright' },
  { name: 'tablet-landscape', width: 1024, height: 768, kind: 'tablet', note: 'tablet sideways' },
  { name: 'phone-small', width: 360, height: 640, kind: 'phone', note: 'small phone, upright' },
  { name: 'phone-medium', width: 390, height: 844, kind: 'phone', note: 'common phone, upright' },
  { name: 'phone-large', width: 430, height: 932, kind: 'phone', note: 'large phone, upright' },
  { name: 'phone-landscape', width: 844, height: 390, kind: 'phone', note: 'common phone, sideways' }
]

export const builtinNames = (): string[] => BUILTIN_VIEWPORTS.map(v => v.name)

const complete = (spec: ViewportSpec): Viewport => ({
  name: spec.name,
  width: spec.width,
  height: spec.height,
  kind: spec.kind,
  deviceScaleFactor: spec.deviceScaleFactor ?? DEFAULT_SCALE[spec.kind],
  isMobile: spec.isMobile ?? spec.kind === 'phone',
  hasTouch: spec.hasTouch ?? spec.kind !== 'desktop',
  derivedFrom: null,
  fraction: null,
  aliases: [],
  note: spec.note ?? ''
})

/** Fractions of the full width that are worth capturing for a given viewport.
 *
 * Every desktop viewport gets the half width — the most common way a window
 * shares a monitor. An ultrawide monitor is usually split in three, so it
 * additionally gets one and two thirds. Tablets and phones are not resizable
 * in that sense and get no part widths.
 */
export const derivedFractions = (spec: ViewportSpec): Array<[number, number, string]> => {
  if (spec.kind !== 'desktop') return []
  const wide = spec.width / spec.height >= ULTRAWIDE_ASPECT
  return wide
    ? [
        [1, 3, 'third'],
        [1, 2, 'half'],
        [2, 3, 'two-thirds']
      ]
    : [[1, 2, 'half']]
}

export interface ExpandOptions {
  /** produce the part widths at all */
  derived: boolean
  minDerivedWidth: number
  onDrop?: (name: string, reason: string) => void
  onDuplicate?: (dropped: string, kept: string) => void
}

const key = (v: Viewport): string =>
  `${v.width}x${v.height}@${v.deviceScaleFactor}:${v.isMobile ? 'm' : '-'}${v.hasTouch ? 't' : '-'}`

/** Expand a list of viewport specs into the effective, deduplicated list.
 *
 * Duplicates are decided by everything that changes the rendering — width,
 * height, device scale factor, mobile and touch emulation — not by the
 * dimensions alone: `tablet-landscape` and `desktop-4-3` share 1024x768 but
 * render differently, so both are kept.
 */
export const expandViewports = (specs: ViewportSpec[], options: ExpandOptions): Viewport[] => {
  const base = specs.map(complete)
  const derived: Viewport[] = []

  if (options.derived) {
    for (const spec of specs) {
      const parent = complete(spec)
      for (const [num, den, label] of derivedFractions(spec)) {
        const width = Math.floor((spec.width * num) / den)
        const name = `${spec.name}-${label}`
        if (width < options.minDerivedWidth) {
          options.onDrop?.(name, `derived width ${width} below minimum ${options.minDerivedWidth}`)
          continue
        }
        derived.push({
          ...parent,
          name,
          width,
          derivedFrom: spec.name,
          fraction: `${num}/${den}`,
          aliases: [],
          note: `${label} of the ${spec.name} width, a window filling part of the monitor`
        })
      }
    }
  }

  const seen = new Map<string, Viewport>()
  for (const viewport of [...base, ...derived]) {
    const existing = seen.get(key(viewport))
    if (existing) {
      existing.aliases.push(viewport.name)
      options.onDuplicate?.(viewport.name, existing.name)
      continue
    }
    seen.set(key(viewport), viewport)
  }
  return [...seen.values()]
}
