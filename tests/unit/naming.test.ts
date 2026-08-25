import { describe, expect, it } from 'vitest'

import { pad, pdfName, pdfPageName, screenshotName, slug } from '../../src/naming.js'

describe('name building blocks', () => {
  it('turns anything into a readable slug', () => {
    expect(slug('Full HD')).toBe('full-hd')
    expect(slug('A4')).toBe('a4')
    expect(slug('  spaces  ')).toBe('spaces')
  })

  it('pads a number to a fixed width so names sort correctly', () => {
    expect(pad(7, 3)).toBe('007')
    expect(pad(1234, 3)).toBe('1234')
    expect(pad(0, 5)).toBe('00000')
  })

  it('never produces a negative position in a name', () => {
    expect(pad(-5, 5)).toBe('00000')
  })
})

describe('screenshot names', () => {
  const parts = { viewport: 'full-hd', width: 1920, height: 1080, sequence: 3, x: 0, y: 2430 }

  it('carries viewport, dimensions, capture type, sequence and scroll position', () => {
    expect(screenshotName({ ...parts, capture: 'scroll' })).toBe('full-hd-1920x1080-scroll-003-x00000y02430.png')
  })

  it('marks the first view and the full page image as such', () => {
    expect(screenshotName({ ...parts, capture: 'viewport', sequence: 0, y: 0 }))
      .toBe('full-hd-1920x1080-viewport-000-x00000y00000.png')
    expect(screenshotName({ ...parts, capture: 'fullpage', sequence: 0, y: 0 }))
      .toBe('full-hd-1920x1080-fullpage-000-x00000y00000.png')
  })

  it('names the inner region and the position of the main document as well', () => {
    expect(
      screenshotName({ ...parts, capture: 'region', sequence: 2, x: 0, y: 480, regionId: 'r03', mainX: 0, mainY: 1200 })
    ).toBe('full-hd-1920x1080-region-002-x00000y00480-r03-main-x00000y01200.png')
  })

  it('gives every position of a series its own name', () => {
    const names = [0, 900, 1800].map((y, index) =>
      screenshotName({ ...parts, capture: 'scroll', sequence: index, y })
    )
    expect(new Set(names).size).toBe(3)
  })

  it('keeps two regions of the same viewport apart', () => {
    const first = screenshotName({ ...parts, capture: 'region', regionId: 'r01', mainX: 0, mainY: 0 })
    const second = screenshotName({ ...parts, capture: 'region', regionId: 'r02', mainX: 0, mainY: 0 })
    expect(first).not.toBe(second)
  })
})

describe('print names', () => {
  it('names a pdf after paper format and orientation', () => {
    expect(pdfName('A4', 'portrait')).toBe('a4-portrait.pdf')
    expect(pdfName('Letter', 'landscape')).toBe('letter-landscape.pdf')
  })

  it('numbers the rendered pages so they sort correctly', () => {
    expect(pdfPageName('A4', 'portrait', 1)).toBe('a4-portrait-p001.png')
    expect(pdfPageName('A4', 'portrait', 12)).toBe('a4-portrait-p012.png')
    const sorted = [1, 2, 10].map(page => pdfPageName('A3', 'landscape', page)).sort()
    expect(sorted).toEqual(['a3-landscape-p001.png', 'a3-landscape-p002.png', 'a3-landscape-p010.png'])
  })
})
