import { describe, expect, it } from 'vitest'

import { axisPositions, extendAxisPositions, scrollGrid, scrollStep } from '../../src/scroll.js'

const base = { overlap: 0.1, maxSteps: 200 }

describe('the step between two shots', () => {
  it('is the visible size minus the overlap', () => {
    expect(scrollStep(1000, 0.1)).toBe(900)
    expect(scrollStep(1000, 0)).toBe(1000)
    expect(scrollStep(720, 0.25)).toBe(540)
  })

  it('never becomes zero, otherwise a series would not advance', () => {
    expect(scrollStep(1, 0.9)).toBe(1)
  })
})

describe('the positions of one axis', () => {
  it('is a single position when everything fits', () => {
    expect(axisPositions({ ...base, viewport: 800, content: 800 }).positions).toEqual([0])
    expect(axisPositions({ ...base, viewport: 800, content: 500 }).positions).toEqual([0])
  })

  it('starts at the origin and ends at the exact last position', () => {
    const result = axisPositions({ ...base, viewport: 1000, content: 3000 })
    expect(result.positions[0]).toBe(0)
    expect(result.positions.at(-1)).toBe(2000)
  })

  it('advances by the visible size minus the overlap', () => {
    const result = axisPositions({ ...base, viewport: 1000, content: 3000 })
    expect(result.positions).toEqual([0, 900, 1800, 2000])
  })

  it('produces no duplicate positions when the end falls on a step', () => {
    const result = axisPositions({ ...base, overlap: 0, viewport: 1000, content: 3000 })
    expect(result.positions).toEqual([0, 1000, 2000])
    expect(new Set(result.positions).size).toBe(result.positions.length)
  })

  it('covers the whole content: no gap between two shots exceeds the visible size', () => {
    const result = axisPositions({ ...base, viewport: 720, content: 5000 })
    for (let index = 1; index < result.positions.length; index += 1) {
      expect(result.positions[index]! - result.positions[index - 1]!).toBeLessThanOrEqual(720)
    }
  })

  it('keeps the exact last position even when the limit cuts the series', () => {
    const result = axisPositions({ viewport: 100, content: 10000, overlap: 0.1, maxSteps: 4 })
    expect(result.limited).toBe(true)
    expect(result.wanted).toBeGreaterThan(4)
    expect(result.positions).toHaveLength(4)
    expect(result.positions.at(-1)).toBe(9900)
  })

  it('reports how many positions the geometry would have needed', () => {
    const result = axisPositions({ viewport: 1000, content: 3000, overlap: 0.1, maxSteps: 2 })
    expect(result.wanted).toBe(4)
    expect(result.positions).toEqual([0, 2000])
  })
})

describe('extending a series while the document grows', () => {
  it('keeps the positions already captured', () => {
    const result = extendAxisPositions([0, 900], { ...base, viewport: 1000, content: 5000 })
    expect(result.positions.slice(0, 2)).toEqual([0, 900])
  })

  it('continues from the last captured position and ends at the new end', () => {
    const result = extendAxisPositions([0, 900], { ...base, viewport: 1000, content: 5000 })
    expect(result.positions).toEqual([0, 900, 1800, 2700, 3600, 4000])
  })

  it('changes nothing when the document did not actually grow', () => {
    const result = extendAxisPositions([0, 900, 1800, 2000], { ...base, viewport: 1000, content: 3000 })
    expect(result.positions).toEqual([0, 900, 1800, 2000])
  })

  it('produces no duplicates', () => {
    const result = extendAxisPositions([0, 1000], { ...base, overlap: 0, viewport: 1000, content: 4000 })
    expect(new Set(result.positions).size).toBe(result.positions.length)
  })

  it('respects the limit and still ends at the exact last position', () => {
    const result = extendAxisPositions([0, 90, 180], { viewport: 100, content: 10000, overlap: 0.1, maxSteps: 4 })
    expect(result.limited).toBe(true)
    expect(result.positions.at(-1)).toBe(9900)
  })
})

describe('the grid of one scrollable box', () => {
  it('is a single cell when nothing scrolls', () => {
    const result = scrollGrid({
      viewportWidth: 800, viewportHeight: 600, contentWidth: 800, contentHeight: 600,
      overlap: 0.1, maxSteps: 200, maxCells: 100
    })
    expect(result.cells).toEqual([{ x: 0, y: 0 }])
  })

  it('combines both axes of the same box in reading order', () => {
    const result = scrollGrid({
      viewportWidth: 1000, viewportHeight: 1000, contentWidth: 2000, contentHeight: 2000,
      overlap: 0, maxSteps: 200, maxCells: 100
    })
    expect(result.cells).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 }
    ])
  })

  it('stops at the cell limit and says so', () => {
    const result = scrollGrid({
      viewportWidth: 100, viewportHeight: 100, contentWidth: 1000, contentHeight: 1000,
      overlap: 0, maxSteps: 200, maxCells: 5
    })
    expect(result.limitedCells).toBe(true)
    expect(result.cells).toHaveLength(5)
    expect(result.wantedCells).toBe(100)
  })

  it('reports a limit per axis separately', () => {
    const result = scrollGrid({
      viewportWidth: 100, viewportHeight: 1000, contentWidth: 10000, contentHeight: 1000,
      overlap: 0, maxSteps: 3, maxCells: 100
    })
    expect(result.limitedX).toBe(true)
    expect(result.limitedY).toBe(false)
  })
})
