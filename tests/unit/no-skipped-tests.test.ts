/** A test may never be switched off.
 *
 * Written down the rule is an intention; enforced by this test it is a fact.
 * It fails on any marker that would make the suite pass by not running.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const TESTS = join(process.cwd(), 'tests')

const MARKERS = [
  /\b(?:it|test|describe|suite|bench)\s*\.\s*(?:skip|only|todo|fails|skipIf|runIf|concurrent\s*\.\s*skip)\b/,
  /\bx(?:it|test|describe)\s*\(/,
  /\b(?:it|test|describe)\s*\.\s*each\s*\(\s*\)\s*\.\s*skip\b/,
  /\bexpect\s*\.\s*soft\b/
]

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return files(path)
    return path.endsWith('.test.ts') ? [path] : []
  })

describe('the test suite itself', () => {
  const found = files(TESTS)

  it('has tests in more than one place', () => {
    expect(found.length).toBeGreaterThan(5)
  })

  for (const file of found) {
    it(`${file.slice(TESTS.length + 1)} runs every test it contains`, () => {
      const text = readFileSync(file, 'utf8')
      for (const marker of MARKERS) {
        expect(marker.test(text), `${file} contains a marker that switches tests off: ${marker}`).toBe(false)
      }
    })
  }
})
