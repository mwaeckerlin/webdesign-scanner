import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { loadConfig } from '../../src/config.js'
import { SecretRegistry } from '../../src/secrets.js'
import { parseWorkflow } from '../../src/workflow.js'

const EXAMPLES = join(process.cwd(), 'examples')
const FIXTURES = join(process.cwd(), 'tests', 'e2e', 'fixtures')
const workspace = mkdtempSync(join(tmpdir(), 'wds-examples-'))

const secretFile = (): string => {
  const path = join(workspace, 'password')
  writeFileSync(path, 'not-a-real-password\n', 'utf8')
  return path
}

/** Parse a shipped workflow, with the secret file pointed at a readable copy. */
const parseShipped = (path: string, env: NodeJS.ProcessEnv) => {
  const text = readFileSync(path, 'utf8').replaceAll('/run/secrets/scan_password', secretFile())
  return parseWorkflow(parseYaml(text), path, new SecretRegistry(), env)
}

describe('the shipped example configuration', () => {
  it('is accepted by the very validation it documents', () => {
    const config = loadConfig({ CONFIG_FILE: join(EXAMPLES, 'config.yaml') })
    expect(config.url).toBe('https://example.com')
  })

  it('really lists every option at its default value', () => {
    const documented = loadConfig({ CONFIG_FILE: join(EXAMPLES, 'config.yaml') })
    const defaults = loadConfig({ TARGET_URL: 'https://example.com' })
    expect(documented).toEqual(defaults)
  })
})

describe('the shipped example workflows', () => {
  it('parse, so a reader can start from them', () => {
    const login = parseShipped(join(EXAMPLES, 'workflow-login.yaml'), { SCAN_USERNAME: 'review' })
    expect(login.name).toBe('login-and-open-dashboard')
    expect(login.steps.at(-1)!.action).toBe('ready')
  })

  it('show every action of the format at least once', () => {
    const reference = parseShipped(join(EXAMPLES, 'workflow-forms-frames-tabs.yaml'), {})
    const used = new Set(reference.steps.map(step => step.action))
    for (const action of ['fill', 'type', 'select', 'check', 'uncheck', 'upload', 'press', 'hover',
      'scrollIntoView', 'expectPopup', 'usePage', 'closePage', 'saveStorageState', 'ready']) {
      expect(used, `action ${action} is missing from the reference workflow`).toContain(action)
    }
  })

  it('keep the password out of the file itself', () => {
    const text = readFileSync(join(EXAMPLES, 'workflow-login.yaml'), 'utf8')
    expect(text).toMatch(/env:\s+SCAN_USERNAME/)
    expect(text).toMatch(/file:\s+\/run\/secrets\//)
  })

  it('parse the host login example, and keep its password out of it too', () => {
    const path = join(EXAMPLES, 'host-login', 'workflow.yaml')
    const workflow = parseShipped(path, { SCAN_USERNAME: 'review' })
    expect(workflow.name).toBe('host-login')
    expect(workflow.steps.at(-1)!.action).toBe('ready')
    expect(readFileSync(path, 'utf8')).toMatch(/file:\s+\/run\/secrets\//)
  })

  it('keep the password file the host login example asks for out of git', () => {
    // the example tells the reader to create examples/host-login/scan_password.txt;
    // without an ignore rule the next `git add -A` would commit it
    const ignored = execFileSync(
      'git', ['check-ignore', 'examples/host-login/scan_password.txt'],
      { cwd: process.cwd(), encoding: 'utf8' }
    )
    expect(ignored.trim()).toBe('examples/host-login/scan_password.txt')
  })
})

describe('the shipped assistant configuration', () => {
  const CLAUDE = join(EXAMPLES, '.claude')
  const skill = (): string => readFileSync(join(CLAUDE, 'skills', 'design-test', 'SKILL.md'), 'utf8')

  it('ships a skill an assistant can pick up on its own', () => {
    const text = skill()
    expect(text.startsWith('---\n'), 'the skill needs front matter').toBe(true)
    const front = text.slice(4, text.indexOf('\n---', 4))
    expect(front).toMatch(/^name:\s*design-test$/m)
    // the description has to say WHEN, otherwise the assistant never reaches
    // for the skill by itself and the whole setup stays decorative
    expect(front).toMatch(/description:.*\bbefore\b/is)
    expect(front).toMatch(/description:.*\bcommit\b/is)
  })

  it('tells the assistant to render before it judges', () => {
    const text = skill()
    expect(text).toMatch(/docker run/)
    expect(text).toMatch(/TARGET_URL=/)
    expect(text).toMatch(/docker cp/)
    // nothing of the host is ever mounted into the container: a run must not
    // be able to reach a working copy
    expect(text).not.toMatch(/-v\s|--volume|--mount/)
  })

  it('demands the full catalogue before a commit', () => {
    const text = skill()
    expect(text).toMatch(/full catalogue/i)
    expect(text).toMatch(/before a commit[^.]*full\s+run\s+is\s+mandatory/is)
  })

  it('carries the whole checklist, so nothing is judged from memory', () => {
    const text = skill().toLowerCase()
    for (const point of ['contrast', 'spacing', 'empty', 'print', 'states', 'consisten']) {
      expect(text, `the checklist says nothing about ${point}`).toContain(point)
    }
  })

  it('ships the rule that makes the check mandatory', () => {
    const text = readFileSync(join(CLAUDE, 'CLAUDE.md'), 'utf8')
    expect(text).toMatch(/design-test/)
    expect(text).toMatch(/before every commit/i)
  })

  it('ships permissions that keep a run from interrupting', () => {
    const settings = JSON.parse(readFileSync(join(CLAUDE, 'settings.json'), 'utf8'))
    expect(settings.permissions.allow).toContain('Bash(docker compose:*)')
  })

  it('points only at files that are really there', () => {
    const text = readFileSync(join(CLAUDE, 'README.md'), 'utf8')
    for (const match of text.matchAll(/]\(([^)#:]+)\)/g)) {
      const target = match[1]!
      expect(existsSync(join(CLAUDE, target)), `${target} is linked but absent`).toBe(true)
    }
  })
})

describe('the configurations the test stack runs on', () => {
  const configs = readdirSync(FIXTURES).filter(name => name.endsWith('.yaml') && !name.startsWith('workflow-'))

  it('are all present', () => {
    expect(configs.length).toBeGreaterThan(5)
  })

  for (const name of configs) {
    it(`${name} is valid, except the one that is broken on purpose`, () => {
      const load = () => loadConfig({ TARGET_URL: 'https://example.com', CONFIG_FILE: join(FIXTURES, name) })
      if (name === 'badconfig.yaml') expect(load).toThrow(/unknown option/)
      else expect(load).not.toThrow()
    })
  }
})
