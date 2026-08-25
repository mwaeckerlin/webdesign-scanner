import { describe, expect, it } from 'vitest'

import {
  BUILTIN_VIEWPORTS,
  MIN_DERIVED_WIDTH,
  ULTRAWIDE_ASPECT,
  builtinNames,
  derivedFractions,
  expandViewports,
  type ViewportSpec
} from '../../src/viewports.js'

const options = { derived: true, minDerivedWidth: MIN_DERIVED_WIDTH }

describe('the built-in viewport catalogue', () => {
  it('covers every aspect ratio and device class the documentation promises', () => {
    expect(builtinNames()).toEqual([
      'desktop-4-3', 'hd', 'desktop-16-10', 'desktop-16-9', 'full-hd', 'desktop-21-9', 'uhd',
      'tablet-portrait', 'tablet-landscape',
      'phone-small', 'phone-medium', 'phone-large', 'phone-landscape'
    ])
  })

  it('gives every entry a width, a height and a device class', () => {
    for (const spec of BUILTIN_VIEWPORTS) {
      expect(spec.width, spec.name).toBeGreaterThan(0)
      expect(spec.height, spec.name).toBeGreaterThan(0)
      expect(['desktop', 'tablet', 'phone']).toContain(spec.kind)
    }
  })

  it('uses names that say what they are', () => {
    for (const spec of BUILTIN_VIEWPORTS) expect(spec.name).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('derived part widths', () => {
  it('gives every desktop viewport its half width', () => {
    expect(derivedFractions({ name: 'x', width: 1920, height: 1080, kind: 'desktop' })).toEqual([[1, 2, 'half']])
  })

  it('gives an ultrawide viewport a third and two thirds as well', () => {
    expect(derivedFractions({ name: 'x', width: 2560, height: 1080, kind: 'desktop' })).toEqual([
      [1, 3, 'third'],
      [1, 2, 'half'],
      [2, 3, 'two-thirds']
    ])
  })

  it('uses the documented aspect ratio as the threshold for ultrawide', () => {
    const justBelow = { name: 'x', width: 1000, height: 501, kind: 'desktop' as const }
    const justAbove = { name: 'x', width: 1000, height: 500, kind: 'desktop' as const }
    expect(justBelow.width / justBelow.height).toBeLessThan(ULTRAWIDE_ASPECT)
    expect(derivedFractions(justBelow)).toHaveLength(1)
    expect(derivedFractions(justAbove)).toHaveLength(3)
  })

  it('gives tablets and phones no part widths, they are not resizable windows', () => {
    expect(derivedFractions({ name: 'x', width: 768, height: 1024, kind: 'tablet' })).toEqual([])
    expect(derivedFractions({ name: 'x', width: 390, height: 844, kind: 'phone' })).toEqual([])
  })

  it('keeps the height and reduces only the width', () => {
    const result = expandViewports([{ name: 'wide', width: 2560, height: 1080, kind: 'desktop' }], options)
    const derived = result.filter(item => item.derivedFrom !== null)
    expect(derived.map(item => [item.name, item.width, item.height])).toEqual([
      ['wide-third', 853, 1080],
      ['wide-half', 1280, 1080],
      ['wide-two-thirds', 1706, 1080]
    ])
  })

  it('records where a part width came from', () => {
    const result = expandViewports([{ name: 'full-hd', width: 1920, height: 1080, kind: 'desktop' }], options)
    const half = result.find(item => item.name === 'full-hd-half')!
    expect(half.derivedFrom).toBe('full-hd')
    expect(half.fraction).toBe('1/2')
  })

  it('drops a part width that would be narrower than a real window', () => {
    const dropped: string[] = []
    const result = expandViewports([{ name: 'tiny', width: 600, height: 400, kind: 'desktop' }], {
      derived: true,
      minDerivedWidth: 320,
      onDrop: name => dropped.push(name)
    })
    expect(result.map(item => item.name)).toEqual(['tiny'])
    expect(dropped).toEqual(['tiny-half'])
  })

  it('produces no part widths at all when they are switched off', () => {
    const result = expandViewports([{ name: 'full-hd', width: 1920, height: 1080, kind: 'desktop' }], {
      derived: false,
      minDerivedWidth: 320
    })
    expect(result.map(item => item.name)).toEqual(['full-hd'])
  })
})

describe('deduplication', () => {
  it('merges two entries that render identically and keeps the first name', () => {
    const merged: Array<[string, string]> = []
    const specs: ViewportSpec[] = [
      { name: 'first', width: 1024, height: 768, kind: 'desktop' },
      { name: 'second', width: 1024, height: 768, kind: 'desktop' }
    ]
    const result = expandViewports(specs, { ...options, onDuplicate: (a, b) => merged.push([a, b]) })
    expect(result.map(item => item.name)).toEqual(['first', 'first-half'])
    expect(result[0]!.aliases).toEqual(['second'])
    expect(result[1]!.aliases).toEqual(['second-half'])
    expect(merged).toEqual([
      ['second', 'first'],
      ['second-half', 'first-half']
    ])
  })

  it('keeps two entries of the same size that render differently', () => {
    const result = expandViewports(
      [
        { name: 'desktop-4-3', width: 1024, height: 768, kind: 'desktop' },
        { name: 'tablet-landscape', width: 1024, height: 768, kind: 'tablet' }
      ],
      options
    )
    // the tablet is no duplicate of the desktop: retina scaling and touch
    // emulation make it render differently at the same size
    expect(result.map(item => item.name)).toEqual(['desktop-4-3', 'tablet-landscape', 'desktop-4-3-half'])
    expect(result[0]!.deviceScaleFactor).toBe(1)
    expect(result[1]!.deviceScaleFactor).toBe(2)
    expect(result[1]!.hasTouch).toBe(true)
  })

  it('merges a part width that collides with a full viewport', () => {
    const result = expandViewports(
      [
        { name: 'wide', width: 2560, height: 1080, kind: 'desktop' },
        { name: 'half-of-wide', width: 1280, height: 1080, kind: 'desktop' }
      ],
      options
    )
    const names = result.map(item => item.name)
    expect(names).toContain('half-of-wide')
    expect(names).not.toContain('wide-half')
    expect(result.find(item => item.name === 'half-of-wide')!.aliases).toEqual(['wide-half'])
  })

  it('produces no duplicate dimensions for the complete built-in catalogue', () => {
    const result = expandViewports(BUILTIN_VIEWPORTS, options)
    const keys = result.map(item => `${item.width}x${item.height}@${item.deviceScaleFactor}${item.hasTouch}${item.isMobile}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
