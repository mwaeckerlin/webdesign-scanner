import { describe, expect, it } from 'vitest'

import { Logger } from '../../src/logging.js'
import { MASK, SecretRegistry } from '../../src/secrets.js'

/** Capture what the logger really writes to the console.
 *
 * Warnings and errors go to stderr; a test that only inspected the collected
 * records would pass while the visible line stayed useless.
 */
const written = (act: () => void): string => {
  const stream = process.stderr as unknown as { write: (chunk: unknown) => boolean }
  const original = stream.write
  const chunks: string[] = []
  stream.write = (chunk: unknown): boolean => {
    chunks.push(String(chunk))
    return true
  }
  try {
    act()
  } finally {
    stream.write = original
  }
  return chunks.join('')
}

describe('a page event in the log', () => {
  it('names the url, so a warning can be judged without opening the manifest', () => {
    const logger = new Logger(new SecretRegistry(), 'info')
    const line = written(() =>
      logger.diagnostic({
        kind: 'requestfailed',
        viewport: 'full-hd',
        text: 'net::ERR_ABORTED',
        url: 'https://example.com/assets/movies/enjoy.mp4'
      })
    )
    expect(line).toContain('requestfailed [full-hd]')
    expect(line).toContain('net::ERR_ABORTED')
    expect(line).toContain('https://example.com/assets/movies/enjoy.mp4')
  })

  it('masks a secret that a url carries', () => {
    const secrets = new SecretRegistry()
    secrets.add('hunter2')
    const logger = new Logger(secrets, 'info')
    const line = written(() =>
      logger.diagnostic({ kind: 'httperror', text: 'http 401', url: 'https://example.com/?token=hunter2', status: 401 })
    )
    expect(line).not.toContain('hunter2')
    expect(line).toContain(MASK)
  })

  it('stays on one line for an event that has no url', () => {
    const logger = new Logger(new SecretRegistry(), 'info')
    const line = written(() => logger.diagnostic({ kind: 'pageerror', viewport: 'hd', text: 'TypeError: x is not a function' }))
    expect(line.trim()).toBe('[warn] pageerror [hd]: TypeError: x is not a function')
  })

  it('keeps the url in the record the manifest is built from', () => {
    const logger = new Logger(new SecretRegistry(), 'info')
    written(() => logger.diagnostic({ kind: 'requestfailed', text: 'net::ERR_ABORTED', url: 'https://example.com/a.mp4' }))
    expect(logger.diagnostics[0]!.url).toBe('https://example.com/a.mp4')
  })
})
