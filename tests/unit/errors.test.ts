import { describe, expect, it } from 'vitest'

import { EXIT, ScannerError, classifyFailure, navigationError } from '../../src/errors.js'

describe('classifying a failure', () => {
  it('keeps a typed failure and the exit code of its category', () => {
    const classified = classifyFailure(navigationError('http 404'), null)
    expect(classified.kind).toBe('navigation')
    expect(classified.exitCode).toBe(EXIT.navigation)
  })

  it('calls an unexpected failure internal, so a real defect stays visible', () => {
    const classified = classifyFailure(new Error('undefined is not an object'), null)
    expect(classified.kind).toBe('internal')
    expect(classified.exitCode).toBe(EXIT.internal)
  })

  it('reports a run stopped from outside as an abort, never as an internal error', () => {
    const closed = new Error('page.waitForTimeout: Target page, context or browser has been closed')
    const classified = classifyFailure(closed, 'SIGTERM')
    expect(classified.kind).toBe('aborted')
    expect(classified.exitCode).toBe(EXIT.aborted)
    expect(classified).toBeInstanceOf(ScannerError)
  })

  it('names the signal that stopped it, in the message and in the details', () => {
    const classified = classifyFailure(new Error('closed'), 'SIGINT')
    expect(classified.message).toContain('SIGINT')
    expect(classified.details).toMatchObject({ signal: 'SIGINT' })
  })

  it('lets the abort outrank the failure the abort itself provoked', () => {
    // closing the browser makes a navigation in flight reject: that rejection
    // is a consequence of the abort, never a page that could not be reached
    const classified = classifyFailure(navigationError('cannot open https://example.com'), 'SIGTERM')
    expect(classified.kind).toBe('aborted')
  })

  it('gives every failure category an exit code of its own', () => {
    const codes = Object.values(EXIT)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
