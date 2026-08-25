/** Small strict validation helpers.
 *
 * Every helper reports the full path of the offending key, so a typo in a
 * deeply nested configuration file names itself instead of silently falling
 * back to a default. Unknown keys are errors, never ignored: a misspelled
 * option that is quietly dropped is the most expensive kind of configuration
 * bug — the run looks fine and does the wrong thing.
 */

import { configError } from './errors.js'

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const asObject = (value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> => {
  if (value === undefined) return {}
  if (!isPlainObject(value)) throw configError(`${path}: expected a mapping, got ${describe(value)}`)
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw configError(`${path}.${key}: unknown option (known: ${[...allowed].sort().join(', ')})`)
    }
  }
  return value
}

export const describe = (value: unknown): string => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'a list'
  if (isPlainObject(value)) return 'a mapping'
  return typeof value
}

export const asString = (value: unknown, path: string, fallback?: string): string => {
  if (value === undefined) {
    if (fallback === undefined) throw configError(`${path}: required`)
    return fallback
  }
  if (typeof value !== 'string') throw configError(`${path}: expected a string, got ${describe(value)}`)
  return value
}

export const asOptionalString = (value: unknown, path: string, fallback: string | null): string | null => {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw configError(`${path}: expected a string, got ${describe(value)}`)
  return value
}

export interface NumberRange {
  min?: number
  max?: number
  integer?: boolean
}

export const asNumber = (value: unknown, path: string, fallback: number, range: NumberRange = {}): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw configError(`${path}: expected a number, got ${describe(value)}`)
  }
  if (range.integer && !Number.isInteger(value)) throw configError(`${path}: expected a whole number, got ${value}`)
  if (range.min !== undefined && value < range.min) throw configError(`${path}: must be at least ${range.min}, got ${value}`)
  if (range.max !== undefined && value > range.max) throw configError(`${path}: must be at most ${range.max}, got ${value}`)
  return value
}

export const asBoolean = (value: unknown, path: string, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw configError(`${path}: expected true or false, got ${describe(value)}`)
  return value
}

export const asEnum = <T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  fallback?: T
): T => {
  if (value === undefined) {
    if (fallback === undefined) throw configError(`${path}: required (one of ${allowed.join(', ')})`)
    return fallback
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw configError(`${path}: expected one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`)
  }
  return value as T
}

export const asArray = (value: unknown, path: string, fallback?: unknown[]): unknown[] => {
  if (value === undefined) {
    if (fallback === undefined) throw configError(`${path}: required`)
    return fallback
  }
  if (!Array.isArray(value)) throw configError(`${path}: expected a list, got ${describe(value)}`)
  return value
}

export const asStringArray = (value: unknown, path: string, fallback: string[]): string[] =>
  asArray(value, path, fallback).map((item, index) => asString(item, `${path}[${index}]`))

export const asStringMap = (value: unknown, path: string, fallback: Record<string, string>): Record<string, string> => {
  if (value === undefined) return fallback
  if (!isPlainObject(value)) throw configError(`${path}: expected a mapping, got ${describe(value)}`)
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) out[key] = asString(item, `${path}.${key}`)
  return out
}

/** Parse a boolean coming from an environment variable. */
export const envBoolean = (value: string | undefined, path: string): boolean | undefined => {
  if (value === undefined || value === '') return undefined
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false
  throw configError(`${path}: expected a boolean (true/false), got ${JSON.stringify(value)}`)
}

/** Parse a number coming from an environment variable. */
export const envNumber = (value: string | undefined, path: string): number | undefined => {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw configError(`${path}: expected a number, got ${JSON.stringify(value)}`)
  return parsed
}

/** Parse a comma separated list coming from an environment variable. */
export const envList = (value: string | undefined): string[] | undefined => {
  if (value === undefined || value.trim() === '') return undefined
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}
