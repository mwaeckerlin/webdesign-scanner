import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { ScannerError } from '../../src/errors.js'
import { SecretRegistry } from '../../src/secrets.js'
import { ACTIONS, loadWorkflow, parseTarget, parseWorkflow, resolveValue } from '../../src/workflow.js'

const workspace = mkdtempSync(join(tmpdir(), 'wds-workflow-'))

const parse = (yaml: string, env: NodeJS.ProcessEnv = {}) =>
  parseWorkflow(parseYaml(yaml), 'test.yaml', new SecretRegistry(), env)

const minimal = (steps: string) => `version: 1\nname: test\nsteps:\n${steps}`

describe('the workflow format', () => {
  it('is versioned and refuses a version it does not understand', () => {
    expect(() => parse('version: 2\nsteps:\n  - action: ready\n')).toThrow(/version 1/)
    expect(() => parse('steps:\n  - action: ready\n')).toThrow(/version 1/)
  })

  it('covers every action the documentation lists', () => {
    expect(ACTIONS).toEqual([
      'check', 'click', 'closePage', 'dblclick', 'expectCount', 'expectHidden', 'expectPopup',
      'expectText', 'expectTitle', 'expectUrl', 'expectVisible', 'fill', 'goto', 'hover', 'press',
      'ready', 'saveStorageState', 'scrollIntoView', 'select', 'type', 'uncheck', 'upload', 'usePage',
      'waitForLoadState', 'waitForSelector', 'waitForTimeout', 'waitForUrl'
    ])
  })

  it('rejects an unknown action and lists the known ones', () => {
    expect(() => parse(minimal('  - action: teleport\n'))).toThrow(/unknown action teleport/)
  })

  it('rejects an unknown option on a step', () => {
    expect(() => parse(minimal('  - action: ready\n    speed: fast\n'))).toThrow(/unknown option/)
  })

  it('needs at least one step', () => {
    expect(() => parse('version: 1\nsteps: []\n')).toThrow(/at least one step/)
  })

  it('classifies a broken workflow as a configuration error', () => {
    try {
      parse(minimal('  - action: teleport\n'))
      expect.unreachable('an unknown action must throw')
    } catch (error) {
      expect((error as ScannerError).exitCode).toBe(2)
    }
  })
})

describe('the explicit release of the state for capture', () => {
  it('is optional: without it the state after the last step is captured', () => {
    expect(parse(minimal('  - action: waitForLoadState\n    state: load\n')).readyAt).toBe(-1)
  })

  it('is recorded when it is there', () => {
    expect(parse(minimal('  - action: ready\n')).readyAt).toBe(0)
  })

  it('must be the last step, because everything after it would never be captured', () => {
    expect(() => parse(minimal('  - action: ready\n  - action: waitForTimeout\n    ms: 1\n')))
      .toThrow(/must therefore be the last step/)
  })

  it('may appear only once', () => {
    expect(() => parse(minimal('  - action: ready\n  - action: ready\n'))).toThrow(/only once/)
  })
})

describe('addressing an element', () => {
  it('accepts role with an accessible name', () => {
    expect(parseTarget({ role: 'button', name: 'Sign in' }, 't')).toEqual({ role: 'button', name: 'Sign in' })
  })

  it('accepts label, placeholder, text, test id, alt text and title', () => {
    for (const key of ['label', 'placeholder', 'text', 'testId', 'altText', 'title']) {
      expect(parseTarget({ [key]: 'x' }, 't')).toEqual({ [key]: 'x' })
    }
  })

  it('accepts a css selector as the documented fallback', () => {
    expect(parseTarget({ css: '#main .row' }, 't')).toEqual({ css: '#main .row' })
  })

  it('needs exactly one way of addressing', () => {
    expect(() => parseTarget({}, 't')).toThrow(/needs one of/)
    expect(() => parseTarget({ role: 'button', css: '#a' }, 't')).toThrow(/exactly one of/)
  })

  it('refuses an accessible name without a role, which would silently do nothing', () => {
    expect(() => parseTarget({ css: '#a', name: 'Sign in' }, 't')).toThrow(/only applies together with/)
  })

  it('narrows a match by text and by position', () => {
    expect(parseTarget({ role: 'listitem', hasText: 'open', nth: 2 }, 't'))
      .toEqual({ role: 'listitem', hasText: 'open', nth: 2 })
  })

  it('scopes a match to a surrounding element', () => {
    const target = parseTarget({ role: 'button', name: 'Delete', within: { testId: 'row-7' } }, 't')
    expect(target.within).toEqual({ testId: 'row-7' })
  })
})

describe('values, secrets and where they come from', () => {
  it('takes a plain string as a literal', () => {
    expect(resolveValue('plain', 'v', new SecretRegistry(), {})).toBe('plain')
  })

  it('reads a value from an environment variable and registers it as a secret', () => {
    const secrets = new SecretRegistry()
    expect(resolveValue({ env: 'PW' }, 'v', secrets, { PW: 'topsecret' })).toBe('topsecret')
    expect(secrets.mask('topsecret')).not.toContain('topsecret')
  })

  it('reads a value from a secret file and strips the trailing newline', () => {
    const path = join(workspace, 'secret.txt')
    writeFileSync(path, 'from-file\n', 'utf8')
    const secrets = new SecretRegistry()
    expect(resolveValue({ file: path }, 'v', secrets, {})).toBe('from-file')
    expect(secrets.mask('from-file')).not.toContain('from-file')
  })

  it('marks a literal explicitly when it looks like a reference', () => {
    expect(resolveValue({ literal: 'env' }, 'v', new SecretRegistry(), {})).toBe('env')
  })

  it('stops when the environment variable is missing instead of sending an empty password', () => {
    expect(() => resolveValue({ env: 'MISSING' }, 'v', new SecretRegistry(), {})).toThrow(/is not set/)
  })

  it('stops when the secret file cannot be read', () => {
    expect(() => resolveValue({ file: join(workspace, 'nope') }, 'v', new SecretRegistry(), {}))
      .toThrow(/cannot read secret file/)
  })

  it('needs exactly one source', () => {
    expect(() => resolveValue({}, 'v', new SecretRegistry(), {})).toThrow(/exactly one of/)
    expect(() => resolveValue({ env: 'A', literal: 'b' }, 'v', new SecretRegistry(), {})).toThrow(/exactly one of/)
  })

  it('registers the secret of a fill step while parsing the workflow', () => {
    const secrets = new SecretRegistry()
    parseWorkflow(
      parseYaml(minimal('  - action: fill\n    target:\n      label: Password\n    value:\n      env: PW\n')),
      'test.yaml',
      secrets,
      { PW: 'hunter2' }
    )
    expect(secrets.mask('hunter2')).not.toContain('hunter2')
  })
})

describe('conditions and optional steps', () => {
  it('accepts a visibility condition', () => {
    const workflow = parse(minimal('  - action: ready\n    when:\n      visible:\n        testId: x\n'))
    expect(workflow.steps[0]!.when).toEqual({ kind: 'visible', target: { testId: 'x' } })
  })

  it('accepts a url condition with a match mode', () => {
    const workflow = parse(minimal('  - action: ready\n    when:\n      urlMatches:\n        url: "**/a"\n'))
    expect(workflow.steps[0]!.when).toEqual({ kind: 'urlMatches', url: '**/a', match: 'glob' })
  })

  it('accepts a negated condition', () => {
    const workflow = parse(minimal('  - action: ready\n    when:\n      not:\n        hidden:\n          testId: x\n'))
    expect(workflow.steps[0]!.when).toEqual({ kind: 'not', condition: { kind: 'hidden', target: { testId: 'x' } } })
  })

  it('needs exactly one condition', () => {
    expect(() => parse(minimal('  - action: ready\n    when: {}\n'))).toThrow(/exactly one of/)
  })

  it('marks a step as allowed to fail', () => {
    expect(parse(minimal('  - action: ready\n    optional: true\n')).steps[0]!.optional).toBe(true)
  })
})

describe('frames, tabs and windows', () => {
  it('addresses a frame by name, by url or by the element it lives in', () => {
    for (const frame of [{ name: 'pay' }, { url: '**/embed' }, { css: 'iframe#editor' }]) {
      expect(parse(minimal(`  - action: ready\n    frame:\n      ${Object.keys(frame)[0]}: "${Object.values(frame)[0]}"\n`)).steps[0]!.frame)
        .toEqual(frame)
    }
  })

  it('needs exactly one way of addressing a frame', () => {
    expect(() => parse(minimal('  - action: ready\n    frame: {}\n'))).toThrow(/exactly one of/)
  })

  it('opens a new tab through the step that triggers it', () => {
    const workflow = parse(
      minimal(
        '  - action: expectPopup\n    name: preview\n    trigger:\n      action: click\n      target:\n        role: link\n        name: Open\n'
      )
    )
    const step = workflow.steps[0]!
    expect(step.action).toBe('expectPopup')
    expect(step.action === 'expectPopup' && step.trigger.action).toBe('click')
  })

  it('rejects a switch to a page that was never opened', () => {
    expect(() => parse(minimal('  - action: usePage\n    name: ghost\n'))).toThrow(/unknown page ghost/)
  })

  it('always knows the page the run started on', () => {
    expect(() => parse(minimal('  - action: usePage\n    name: main\n'))).not.toThrow()
  })
})

describe('the select action', () => {
  it('picks by value, by visible label or by position', () => {
    for (const key of ['values', 'labels']) {
      expect(() => parse(minimal(`  - action: select\n    target:\n      label: L\n    ${key}:\n      - a\n`))).not.toThrow()
    }
    expect(() => parse(minimal('  - action: select\n    target:\n      label: L\n    indexes:\n      - 0\n'))).not.toThrow()
  })

  it('needs exactly one of them', () => {
    expect(() => parse(minimal('  - action: select\n    target:\n      label: L\n'))).toThrow(/exactly one of/)
    expect(() =>
      parse(minimal('  - action: select\n    target:\n      label: L\n    values:\n      - a\n    labels:\n      - b\n'))
    ).toThrow(/exactly one of/)
  })
})

describe('reading a workflow from disk', () => {
  it('reads yaml', () => {
    const path = join(workspace, 'flow.yaml')
    writeFileSync(path, minimal('  - action: ready\n'), 'utf8')
    expect(loadWorkflow(path, new SecretRegistry(), {}).name).toBe('test')
  })

  it('reads json', () => {
    const path = join(workspace, 'flow.json')
    writeFileSync(path, JSON.stringify({ version: 1, name: 'json', steps: [{ action: 'ready' }] }), 'utf8')
    expect(loadWorkflow(path, new SecretRegistry(), {}).name).toBe('json')
  })

  it('reports a missing file instead of running without a workflow', () => {
    expect(() => loadWorkflow(join(workspace, 'nope.yaml'), new SecretRegistry(), {}))
      .toThrow(/cannot read workflow file/)
  })
})
