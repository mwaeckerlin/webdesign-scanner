/** Everything that is evaluated inside the page.
 *
 * These functions are serialized and run in the browser, so each one must be
 * self-contained: no imports, no closure over anything outside its argument.
 */

/** Attribute the tool sets on every inner scroll region it decided to capture. */
export const REGION_ATTRIBUTE = 'data-wds-region'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface RegionInfo {
  id: string
  selector: string
  label: string
  depth: number
  box: Box
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
  scrollLeft: number
  scrollTop: number
}

export interface RegionScan {
  regions: RegionInfo[]
  /** how many visible scrollable regions existed before the limits applied */
  found: number
  /** dropped because they sat deeper than the configured nesting depth */
  tooDeep: number
}

export interface DocumentMetrics {
  scrollWidth: number
  scrollHeight: number
  clientWidth: number
  clientHeight: number
  scrollLeft: number
  scrollTop: number
  title: string
  url: string
}

/** Size and current offset of the main document. */
export const readDocumentMetrics = (): DocumentMetrics => {
  const element = document.scrollingElement ?? document.documentElement
  return {
    scrollWidth: Math.max(element.scrollWidth, document.body ? document.body.scrollWidth : 0),
    scrollHeight: Math.max(element.scrollHeight, document.body ? document.body.scrollHeight : 0),
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollLeft: Math.round(element.scrollLeft),
    scrollTop: Math.round(element.scrollTop),
    title: document.title,
    url: location.href
  }
}

/** Move the main document to an exact offset and report where it ended up. */
export const scrollDocumentTo = (position: { x: number; y: number }): { x: number; y: number } => {
  const element = document.scrollingElement ?? document.documentElement
  element.scrollLeft = position.x
  element.scrollTop = position.y
  return { x: Math.round(element.scrollLeft), y: Math.round(element.scrollTop) }
}

/** Find every visible, genuinely scrollable inner region and tag it.
 *
 * Genuinely scrollable means: the computed overflow allows scrolling on that
 * axis *and* there is more content than fits. A `overflow: auto` box whose
 * content fits is not a scroll region and would only produce duplicate shots.
 */
export const detectScrollRegions = (options: {
  attribute: string
  minWidth: number
  minHeight: number
  maxRegions: number
  maxDepth: number
  tolerance: number
}): RegionScan => {
  const scrollingElement = document.scrollingElement ?? document.documentElement
  const scrollableStyles = ['auto', 'scroll', 'overlay']

  const scrollable = (element: Element): boolean => {
    const style = getComputedStyle(element)
    const vertical = scrollableStyles.includes(style.overflowY) && element.scrollHeight - element.clientHeight > options.tolerance
    const horizontal = scrollableStyles.includes(style.overflowX) && element.scrollWidth - element.clientWidth > options.tolerance
    return vertical || horizontal
  }

  const rendered = (element: Element, box: DOMRect): boolean => {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (Number(style.opacity) === 0) return false
    return box.width >= options.minWidth && box.height >= options.minHeight
  }

  const cssPath = (element: Element): string => {
    const parts: string[] = []
    let node: Element | null = element
    while (node && parts.length < 8) {
      let part = node.tagName.toLowerCase()
      if (node.id) {
        parts.unshift(`${part}#${CSS.escape(node.id)}`)
        break
      }
      const parent: Element | null = node.parentElement
      if (parent) {
        const twins = Array.from(parent.children).filter(child => child.tagName === node!.tagName)
        if (twins.length > 1) part += `:nth-of-type(${twins.indexOf(node) + 1})`
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(' > ')
  }

  const labelOf = (element: Element): string => {
    const aria = element.getAttribute('aria-label')
    if (aria) return aria
    const labelled = element.getAttribute('aria-labelledby')
    if (labelled) {
      const referenced = document.getElementById(labelled)
      if (referenced?.textContent) return referenced.textContent.trim().slice(0, 60)
    }
    if (element.id) return `#${element.id}`
    const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : ''
    return className ? `.${className}` : element.tagName.toLowerCase()
  }

  const candidates: Array<{ element: Element; box: DOMRect; depth: number }> = []
  for (const element of Array.from(document.querySelectorAll('*'))) {
    if (element === scrollingElement || element === document.body) continue
    if (!scrollable(element)) continue
    const box = element.getBoundingClientRect()
    if (!rendered(element, box)) continue
    let depth = 1
    let parent = element.parentElement
    while (parent) {
      if (parent !== scrollingElement && parent !== document.body && scrollable(parent)) depth += 1
      parent = parent.parentElement
    }
    candidates.push({ element, box, depth })
  }

  const found = candidates.length
  const shallow = candidates.filter(candidate => candidate.depth <= options.maxDepth)
  const tooDeep = found - shallow.length

  shallow.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
  const kept = shallow.slice(0, options.maxRegions)

  const regions: RegionInfo[] = kept.map((candidate, index) => {
    const id = `r${String(index + 1).padStart(2, '0')}`
    candidate.element.setAttribute(options.attribute, id)
    const scroll = candidate.element
    const offset = { x: window.scrollX, y: window.scrollY }
    const box = candidate.element.getBoundingClientRect()
    return {
      id,
      selector: cssPath(candidate.element),
      label: labelOf(candidate.element),
      depth: candidate.depth,
      box: {
        x: Math.round(box.x + offset.x),
        y: Math.round(box.y + offset.y),
        width: Math.round(box.width),
        height: Math.round(box.height)
      },
      clientWidth: scroll.clientWidth,
      clientHeight: scroll.clientHeight,
      scrollWidth: scroll.scrollWidth,
      scrollHeight: scroll.scrollHeight,
      scrollLeft: Math.round(scroll.scrollLeft),
      scrollTop: Math.round(scroll.scrollTop)
    }
  })

  return { regions, found, tooDeep }
}

/** Current geometry of one tagged region, in document coordinates. */
export const readRegion = (options: { attribute: string; id: string }): RegionInfo | null => {
  const element = document.querySelector(`[${options.attribute}="${options.id}"]`)
  if (!element) return null
  const box = element.getBoundingClientRect()
  return {
    id: options.id,
    selector: '',
    label: '',
    depth: 0,
    box: {
      x: Math.round(box.x + window.scrollX),
      y: Math.round(box.y + window.scrollY),
      width: Math.round(box.width),
      height: Math.round(box.height)
    },
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    scrollLeft: Math.round(element.scrollLeft),
    scrollTop: Math.round(element.scrollTop)
  }
}

/** Move one tagged region to an exact offset. */
export const scrollRegionTo = (options: {
  attribute: string
  id: string
  x: number
  y: number
}): { x: number; y: number } | null => {
  const element = document.querySelector(`[${options.attribute}="${options.id}"]`)
  if (!element) return null
  element.scrollLeft = options.x
  element.scrollTop = options.y
  return { x: Math.round(element.scrollLeft), y: Math.round(element.scrollTop) }
}

/** Put every tagged region back to the offset it had when it was detected. */
export const resetRegions = (options: { attribute: string; offsets: Array<{ id: string; x: number; y: number }> }): void => {
  for (const offset of options.offsets) {
    const element = document.querySelector(`[${options.attribute}="${offset.id}"]`)
    if (!element) continue
    element.scrollLeft = offset.x
    element.scrollTop = offset.y
  }
}

/** Wait until all webfonts finished loading. */
export const waitForFonts = (): Promise<void> => document.fonts.ready.then(() => undefined)
