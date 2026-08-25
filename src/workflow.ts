/** The declarative workflow format: schema, parsing and validation.
 *
 * A workflow describes how to get from the entry url to the state that is
 * worth analysing — accept the cookie banner, log in, open the right screen —
 * and how to prove that this state was actually reached. It is versioned, so
 * a file written today keeps its meaning.
 *
 * Secrets never belong into the file: a value may be a reference to an
 * environment variable or to a secret file, and every resolved value is
 * registered for masking before it is used.
 */

import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

import { configError } from './errors.js'
import type { SecretRegistry } from './secrets.js'
import { asArray, asBoolean, asEnum, asNumber, asObject, asString, asStringArray, isPlainObject } from './validate.js'

export const WORKFLOW_VERSION = 1

export const MATCH_MODES = ['exact', 'contains', 'glob', 'regex'] as const
export type MatchMode = (typeof MATCH_MODES)[number]

export const ELEMENT_STATES = ['visible', 'hidden', 'attached', 'detached'] as const
export type ElementState = (typeof ELEMENT_STATES)[number]

export const LOAD_STATES = ['load', 'domcontentloaded', 'networkidle'] as const
export type LoadState = (typeof LOAD_STATES)[number]

/** How an element is addressed. Role, label, placeholder, text, test id, alt
 * text and title are the robust forms; `css` is the documented fallback for
 * markup that offers nothing better. */
export interface Target {
  role?: string
  name?: string
  exact?: boolean
  label?: string
  placeholder?: string
  text?: string
  testId?: string
  altText?: string
  title?: string
  css?: string
  hasText?: string
  nth?: number
  within?: Target
}

export interface FrameRef {
  name?: string
  url?: string
  css?: string
}

export type Condition =
  | { kind: 'visible'; target: Target }
  | { kind: 'hidden'; target: Target }
  | { kind: 'urlMatches'; url: string; match: MatchMode }
  | { kind: 'not'; condition: Condition }

export interface StepBase {
  index: number
  action: string
  label: string
  optional: boolean
  when: Condition | null
  timeout: number | null
  frame: FrameRef | null
  page: string | null
}

export type Step = StepBase &
  (
    | { action: 'goto'; url: string; waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' }
    | { action: 'click'; target: Target; button: 'left' | 'right' | 'middle'; clickCount: number; force: boolean }
    | { action: 'dblclick'; target: Target }
    | { action: 'hover'; target: Target }
    | { action: 'fill'; target: Target; value: string }
    | { action: 'type'; target: Target; value: string; delay: number }
    | { action: 'press'; target: Target | null; key: string }
    | { action: 'select'; target: Target; values: string[] | null; labels: string[] | null; indexes: number[] | null }
    | { action: 'check'; target: Target }
    | { action: 'uncheck'; target: Target }
    | { action: 'upload'; target: Target; files: string[] }
    | { action: 'scrollIntoView'; target: Target }
    | { action: 'waitForSelector'; target: Target; state: ElementState }
    | { action: 'waitForUrl'; url: string; match: MatchMode }
    | { action: 'waitForLoadState'; state: LoadState }
    | { action: 'waitForTimeout'; ms: number }
    | { action: 'expectVisible'; target: Target }
    | { action: 'expectHidden'; target: Target }
    | { action: 'expectText'; target: Target; text: string; match: MatchMode }
    | { action: 'expectCount'; target: Target; count: number }
    | { action: 'expectUrl'; url: string; match: MatchMode }
    | { action: 'expectTitle'; text: string; match: MatchMode }
    | { action: 'expectPopup'; name: string; trigger: Step }
    | { action: 'usePage'; name: string }
    | { action: 'closePage'; name: string }
    | { action: 'saveStorageState'; path: string }
    | { action: 'ready' }
  )

export interface Workflow {
  version: number
  name: string
  description: string
  defaults: { timeout: number }
  steps: Step[]
  /** index of the explicit `ready` step, or -1 when the end of the list counts */
  readyAt: number
  sourcePath: string
}

const TARGET_KEYS = [
  'role', 'name', 'exact', 'label', 'placeholder', 'text', 'testId', 'altText',
  'title', 'css', 'hasText', 'nth', 'within'
] as const

const PRIMARY_TARGET_KEYS = ['role', 'label', 'placeholder', 'text', 'testId', 'altText', 'title', 'css'] as const

const STEP_COMMON_KEYS = ['action', 'label', 'optional', 'when', 'timeout', 'frame', 'page'] as const

const ACTION_KEYS: Record<string, readonly string[]> = {
  goto: ['url', 'waitUntil'],
  click: ['target', 'button', 'clickCount', 'force'],
  dblclick: ['target'],
  hover: ['target'],
  fill: ['target', 'value'],
  type: ['target', 'value', 'delay'],
  press: ['target', 'key'],
  select: ['target', 'values', 'labels', 'indexes'],
  check: ['target'],
  uncheck: ['target'],
  upload: ['target', 'files'],
  scrollIntoView: ['target'],
  waitForSelector: ['target', 'state'],
  waitForUrl: ['url', 'match'],
  waitForLoadState: ['state'],
  waitForTimeout: ['ms'],
  expectVisible: ['target'],
  expectHidden: ['target'],
  expectText: ['target', 'text', 'match'],
  expectCount: ['target', 'count'],
  expectUrl: ['url', 'match'],
  expectTitle: ['text', 'match'],
  expectPopup: ['name', 'trigger'],
  usePage: ['name'],
  closePage: ['name'],
  saveStorageState: ['path'],
  ready: []
}

export const ACTIONS = Object.keys(ACTION_KEYS).sort()

export const parseTarget = (value: unknown, path: string): Target => {
  const raw = asObject(value, path, TARGET_KEYS)
  const target: Target = {}
  if (raw.role !== undefined) target.role = asString(raw.role, `${path}.role`)
  if (raw.name !== undefined) target.name = asString(raw.name, `${path}.name`)
  if (raw.exact !== undefined) target.exact = asBoolean(raw.exact, `${path}.exact`, true)
  if (raw.label !== undefined) target.label = asString(raw.label, `${path}.label`)
  if (raw.placeholder !== undefined) target.placeholder = asString(raw.placeholder, `${path}.placeholder`)
  if (raw.text !== undefined) target.text = asString(raw.text, `${path}.text`)
  if (raw.testId !== undefined) target.testId = asString(raw.testId, `${path}.testId`)
  if (raw.altText !== undefined) target.altText = asString(raw.altText, `${path}.altText`)
  if (raw.title !== undefined) target.title = asString(raw.title, `${path}.title`)
  if (raw.css !== undefined) target.css = asString(raw.css, `${path}.css`)
  if (raw.hasText !== undefined) target.hasText = asString(raw.hasText, `${path}.hasText`)
  if (raw.nth !== undefined) target.nth = asNumber(raw.nth, `${path}.nth`, 0, { integer: true, min: 0 })
  if (raw.within !== undefined) target.within = parseTarget(raw.within, `${path}.within`)

  const primaries = PRIMARY_TARGET_KEYS.filter(key => target[key] !== undefined)
  if (primaries.length === 0) {
    throw configError(`${path}: needs one of ${PRIMARY_TARGET_KEYS.join(', ')}`)
  }
  if (primaries.length > 1) {
    throw configError(`${path}: expected exactly one of ${PRIMARY_TARGET_KEYS.join(', ')}, got ${primaries.join(' and ')}`)
  }
  if (target.name !== undefined && target.role === undefined) {
    throw configError(`${path}.name: the accessible name only applies together with \`role\``)
  }
  return target
}

const parseFrame = (value: unknown, path: string): FrameRef | null => {
  if (value === undefined || value === null) return null
  const raw = asObject(value, path, ['name', 'url', 'css'])
  const frame: FrameRef = {}
  if (raw.name !== undefined) frame.name = asString(raw.name, `${path}.name`)
  if (raw.url !== undefined) frame.url = asString(raw.url, `${path}.url`)
  if (raw.css !== undefined) frame.css = asString(raw.css, `${path}.css`)
  const given = Object.keys(frame)
  if (given.length !== 1) throw configError(`${path}: expected exactly one of name, url, css`)
  return frame
}

const parseCondition = (value: unknown, path: string): Condition | null => {
  if (value === undefined || value === null) return null
  const raw = asObject(value, path, ['visible', 'hidden', 'urlMatches', 'not'])
  const given = Object.keys(raw)
  if (given.length !== 1) throw configError(`${path}: expected exactly one of visible, hidden, urlMatches, not`)
  if (raw.visible !== undefined) return { kind: 'visible', target: parseTarget(raw.visible, `${path}.visible`) }
  if (raw.hidden !== undefined) return { kind: 'hidden', target: parseTarget(raw.hidden, `${path}.hidden`) }
  if (raw.urlMatches !== undefined) {
    const item = asObject(raw.urlMatches, `${path}.urlMatches`, ['url', 'match'])
    return {
      kind: 'urlMatches',
      url: asString(item.url, `${path}.urlMatches.url`),
      match: asEnum<MatchMode>(item.match, `${path}.urlMatches.match`, MATCH_MODES, 'glob')
    }
  }
  const nested = parseCondition(raw.not, `${path}.not`)
  if (nested === null) throw configError(`${path}.not: expected a condition`)
  return { kind: 'not', condition: nested }
}

/** Resolve a value reference. A plain string is a literal; `env` and `file`
 * pull the value from outside the workflow file and register it as a secret. */
export const resolveValue = (value: unknown, path: string, secrets: SecretRegistry, env: NodeJS.ProcessEnv): string => {
  if (typeof value === 'string') return value
  if (!isPlainObject(value)) throw configError(`${path}: expected a string or a mapping with env, file or literal`)
  const raw = asObject(value, path, ['env', 'file', 'literal'])
  const given = Object.keys(raw)
  if (given.length !== 1) throw configError(`${path}: expected exactly one of env, file, literal`)
  if (raw.literal !== undefined) return asString(raw.literal, `${path}.literal`)
  if (raw.env !== undefined) {
    const name = asString(raw.env, `${path}.env`)
    const resolved = env[name]
    if (resolved === undefined) throw configError(`${path}.env: environment variable ${name} is not set`)
    secrets.add(resolved)
    return resolved
  }
  const file = asString(raw.file, `${path}.file`)
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch (error) {
    throw configError(`${path}.file: cannot read secret file ${file}: ${(error as Error).message}`)
  }
  const trimmed = content.replace(/\r?\n$/, '')
  secrets.add(trimmed)
  return trimmed
}

const parseStep = (
  value: unknown,
  path: string,
  index: number,
  defaults: { timeout: number },
  secrets: SecretRegistry,
  env: NodeJS.ProcessEnv
): Step => {
  if (!isPlainObject(value)) throw configError(`${path}: expected a mapping with an \`action\``)
  const action = asString(value.action, `${path}.action`)
  const known = ACTION_KEYS[action]
  if (known === undefined) throw configError(`${path}.action: unknown action ${action} (known: ${ACTIONS.join(', ')})`)

  const raw = asObject(value, path, [...STEP_COMMON_KEYS, ...known])
  const base: StepBase = {
    index,
    action,
    label: asString(raw.label, `${path}.label`, action),
    optional: asBoolean(raw.optional, `${path}.optional`, false),
    when: parseCondition(raw.when, `${path}.when`),
    timeout: raw.timeout === undefined ? null : asNumber(raw.timeout, `${path}.timeout`, defaults.timeout, { min: 0, integer: true }),
    frame: parseFrame(raw.frame, `${path}.frame`),
    page: raw.page === undefined ? null : asString(raw.page, `${path}.page`)
  }

  const target = () => parseTarget(raw.target, `${path}.target`)

  switch (action) {
    case 'goto':
      return {
        ...base,
        action: 'goto',
        url: asString(raw.url, `${path}.url`),
        waitUntil: asEnum(raw.waitUntil, `${path}.waitUntil`, ['load', 'domcontentloaded', 'networkidle', 'commit'] as const, 'load')
      }
    case 'click':
      return {
        ...base,
        action: 'click',
        target: target(),
        button: asEnum(raw.button, `${path}.button`, ['left', 'right', 'middle'] as const, 'left'),
        clickCount: asNumber(raw.clickCount, `${path}.clickCount`, 1, { min: 1, max: 3, integer: true }),
        force: asBoolean(raw.force, `${path}.force`, false)
      }
    case 'dblclick':
      return { ...base, action: 'dblclick', target: target() }
    case 'hover':
      return { ...base, action: 'hover', target: target() }
    case 'fill':
      return { ...base, action: 'fill', target: target(), value: resolveValue(raw.value, `${path}.value`, secrets, env) }
    case 'type':
      return {
        ...base,
        action: 'type',
        target: target(),
        value: resolveValue(raw.value, `${path}.value`, secrets, env),
        delay: asNumber(raw.delay, `${path}.delay`, 0, { min: 0, integer: true })
      }
    case 'press':
      return {
        ...base,
        action: 'press',
        target: raw.target === undefined ? null : target(),
        key: asString(raw.key, `${path}.key`)
      }
    case 'select': {
      const values = raw.values === undefined ? null : asStringArray(raw.values, `${path}.values`, [])
      const labels = raw.labels === undefined ? null : asStringArray(raw.labels, `${path}.labels`, [])
      const indexes = raw.indexes === undefined
        ? null
        : asArray(raw.indexes, `${path}.indexes`, []).map((item, i) => asNumber(item, `${path}.indexes[${i}]`, 0, { min: 0, integer: true }))
      const given = [values, labels, indexes].filter(item => item !== null)
      if (given.length !== 1) throw configError(`${path}: expected exactly one of values, labels, indexes`)
      return { ...base, action: 'select', target: target(), values, labels, indexes }
    }
    case 'check':
      return { ...base, action: 'check', target: target() }
    case 'uncheck':
      return { ...base, action: 'uncheck', target: target() }
    case 'upload':
      return { ...base, action: 'upload', target: target(), files: asStringArray(raw.files, `${path}.files`, []) }
    case 'scrollIntoView':
      return { ...base, action: 'scrollIntoView', target: target() }
    case 'waitForSelector':
      return {
        ...base,
        action: 'waitForSelector',
        target: target(),
        state: asEnum<ElementState>(raw.state, `${path}.state`, ELEMENT_STATES, 'visible')
      }
    case 'waitForUrl':
      return {
        ...base,
        action: 'waitForUrl',
        url: asString(raw.url, `${path}.url`),
        match: asEnum<MatchMode>(raw.match, `${path}.match`, MATCH_MODES, 'glob')
      }
    case 'waitForLoadState':
      return { ...base, action: 'waitForLoadState', state: asEnum<LoadState>(raw.state, `${path}.state`, LOAD_STATES, 'load') }
    case 'waitForTimeout':
      return { ...base, action: 'waitForTimeout', ms: asNumber(raw.ms, `${path}.ms`, 0, { min: 0, integer: true }) }
    case 'expectVisible':
      return { ...base, action: 'expectVisible', target: target() }
    case 'expectHidden':
      return { ...base, action: 'expectHidden', target: target() }
    case 'expectText':
      return {
        ...base,
        action: 'expectText',
        target: target(),
        text: asString(raw.text, `${path}.text`),
        match: asEnum<MatchMode>(raw.match, `${path}.match`, MATCH_MODES, 'contains')
      }
    case 'expectCount':
      return { ...base, action: 'expectCount', target: target(), count: asNumber(raw.count, `${path}.count`, 0, { min: 0, integer: true }) }
    case 'expectUrl':
      return {
        ...base,
        action: 'expectUrl',
        url: asString(raw.url, `${path}.url`),
        match: asEnum<MatchMode>(raw.match, `${path}.match`, MATCH_MODES, 'glob')
      }
    case 'expectTitle':
      return {
        ...base,
        action: 'expectTitle',
        text: asString(raw.text, `${path}.text`),
        match: asEnum<MatchMode>(raw.match, `${path}.match`, MATCH_MODES, 'contains')
      }
    case 'expectPopup': {
      const trigger = parseStep(raw.trigger, `${path}.trigger`, index, defaults, secrets, env)
      if (trigger.action === 'expectPopup') throw configError(`${path}.trigger: an expectPopup cannot trigger itself`)
      return { ...base, action: 'expectPopup', name: asString(raw.name, `${path}.name`), trigger }
    }
    case 'usePage':
      return { ...base, action: 'usePage', name: asString(raw.name, `${path}.name`) }
    case 'closePage':
      return { ...base, action: 'closePage', name: asString(raw.name, `${path}.name`) }
    case 'saveStorageState':
      return { ...base, action: 'saveStorageState', path: asString(raw.path, `${path}.path`) }
    default:
      return { ...base, action: 'ready' }
  }
}

/** Parse a workflow from an already decoded structure. */
export const parseWorkflow = (
  raw: unknown,
  sourcePath: string,
  secrets: SecretRegistry,
  env: NodeJS.ProcessEnv
): Workflow => {
  const root = asObject(raw ?? {}, 'workflow', ['version', 'name', 'description', 'defaults', 'steps'])
  const version = asNumber(root.version, 'workflow.version', 0, { integer: true, min: 1 })
  if (version !== WORKFLOW_VERSION) {
    throw configError(`workflow.version: this build understands version ${WORKFLOW_VERSION}, got ${version || 'none'}`)
  }
  const defaultsRaw = asObject(root.defaults, 'workflow.defaults', ['timeout'])
  const defaults = { timeout: asNumber(defaultsRaw.timeout, 'workflow.defaults.timeout', 15000, { min: 0, integer: true }) }

  const stepList = asArray(root.steps, 'workflow.steps', [])
  if (stepList.length === 0) throw configError('workflow.steps: a workflow needs at least one step')

  const steps = stepList.map((value, index) => parseStep(value, `workflow.steps[${index}]`, index, defaults, secrets, env))

  const readyIndexes = steps.map((step, index) => (step.action === 'ready' ? index : -1)).filter(index => index >= 0)
  if (readyIndexes.length > 1) throw configError('workflow.steps: `ready` may appear only once')
  const readyAt = readyIndexes[0] ?? -1
  if (readyAt >= 0 && readyAt !== steps.length - 1) {
    throw configError('workflow.steps: `ready` releases the state for capture and must therefore be the last step')
  }

  const pageNames = new Set<string>(['main'])
  for (const step of steps) {
    if (step.action === 'expectPopup') pageNames.add(step.name)
  }
  for (const step of steps) {
    if ((step.action === 'usePage' || step.action === 'closePage') && !pageNames.has(step.name)) {
      throw configError(
        `workflow.steps[${step.index}].name: unknown page ${step.name} (open it with expectPopup first, or use \`main\`)`
      )
    }
    if (step.page !== null && !pageNames.has(step.page)) {
      throw configError(`workflow.steps[${step.index}].page: unknown page ${step.page}`)
    }
  }

  return {
    version,
    name: asString(root.name, 'workflow.name', 'workflow'),
    description: asString(root.description, 'workflow.description', ''),
    defaults,
    steps,
    readyAt,
    sourcePath
  }
}

/** Read and parse a workflow file (YAML or JSON). */
export const loadWorkflow = (path: string, secrets: SecretRegistry, env: NodeJS.ProcessEnv): Workflow => {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw configError(`cannot read workflow file ${path}: ${(error as Error).message}`)
  }
  let decoded: unknown
  try {
    decoded = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text)
  } catch (error) {
    throw configError(`cannot parse workflow file ${path}: ${(error as Error).message}`)
  }
  return parseWorkflow(decoded, path, secrets, env)
}

/** Description of a step for the manifest — never carries a value. */
export const describeStep = (step: Step): Record<string, unknown> => ({
  index: step.index,
  action: step.action,
  label: step.label,
  optional: step.optional,
  conditional: step.when !== null
})
