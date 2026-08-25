import { describe, expect, it } from 'vitest'

import { describeMatch, globToRegExp, matches } from '../../src/match.js'

describe('matching an expected text or url', () => {
  it('compares literally in exact mode', () => {
    expect(matches('https://a/b', 'https://a/b', 'exact')).toBe(true)
    expect(matches('https://a/b?x=1', 'https://a/b', 'exact')).toBe(false)
  })

  it('looks for a fragment in contains mode', () => {
    expect(matches('Welcome, Marc', 'Marc', 'contains')).toBe(true)
    expect(matches('Welcome', 'Marc', 'contains')).toBe(false)
  })

  it('lets a star stop at a path separator', () => {
    expect(matches('https://a/b', 'https://a/*', 'glob')).toBe(true)
    expect(matches('https://a/b/c', 'https://a/*', 'glob')).toBe(false)
  })

  it('lets a double star cross path separators', () => {
    expect(matches('https://a/b/c/d', 'https://a/**', 'glob')).toBe(true)
    expect(matches('https://host/app/dashboard?tab=1', '**/app/**', 'glob')).toBe(true)
  })

  it('lets a question mark stand for exactly one character', () => {
    expect(matches('page1.html', 'page?.html', 'glob')).toBe(true)
    expect(matches('page12.html', 'page?.html', 'glob')).toBe(false)
  })

  it('anchors a glob, so a partial match is not enough', () => {
    expect(matches('https://a/bcd', 'https://a/b', 'glob')).toBe(false)
  })

  it('treats regular expression characters in a glob as ordinary text', () => {
    expect(matches('a.b', 'a.b', 'glob')).toBe(true)
    expect(matches('axb', 'a.b', 'glob')).toBe(false)
  })

  it('uses a real regular expression in regex mode', () => {
    expect(matches('order-4711', '^order-\\d+$', 'regex')).toBe(true)
    expect(matches('order-x', '^order-\\d+$', 'regex')).toBe(false)
  })

  it('builds an anchored expression from a glob', () => {
    const expression = globToRegExp('a/*')
    expect(expression.source.startsWith('^')).toBe(true)
    expect(expression.source.endsWith('$')).toBe(true)
    expect(expression.test('a/b')).toBe(true)
    expect(expression.test('xa/b')).toBe(false)
  })

  it('explains in words what it expected, for the failure message', () => {
    expect(describeMatch('x', 'exact')).toContain('exactly')
    expect(describeMatch('x', 'contains')).toContain('containing')
    expect(describeMatch('x', 'glob')).toContain('pattern')
    expect(describeMatch('x', 'regex')).toContain('expression')
  })
})
