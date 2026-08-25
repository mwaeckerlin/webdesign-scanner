/** Text and url matching for workflow assertions.
 *
 * The same four modes apply everywhere an expected text or url is written, so
 * a workflow author learns them once: `exact`, `contains`, `glob` and
 * `regex`. In glob mode `*` stops at a path separator, `**` crosses it and
 * `?` stands for a single character.
 */

import type { MatchMode } from './workflow.js'

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Translate a glob pattern into an anchored regular expression. */
export const globToRegExp = (pattern: string): RegExp => {
  let out = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        out += '.*'
        index += 1
      } else {
        out += '[^/]*'
      }
      continue
    }
    out += char === '?' ? '[^/]' : escapeRegex(char)
  }
  return new RegExp(`^${out}$`)
}

/** True when `value` satisfies `pattern` under the given mode. */
export const matches = (value: string, pattern: string, mode: MatchMode): boolean => {
  switch (mode) {
    case 'exact':
      return value === pattern
    case 'contains':
      return value.includes(pattern)
    case 'glob':
      return globToRegExp(pattern).test(value)
    case 'regex':
      return new RegExp(pattern).test(value)
  }
}

/** Wording used in assertion failures. */
export const describeMatch = (pattern: string, mode: MatchMode): string => {
  switch (mode) {
    case 'exact':
      return `exactly ${JSON.stringify(pattern)}`
    case 'contains':
      return `containing ${JSON.stringify(pattern)}`
    case 'glob':
      return `matching the pattern ${JSON.stringify(pattern)}`
    case 'regex':
      return `matching the expression ${JSON.stringify(pattern)}`
  }
}
