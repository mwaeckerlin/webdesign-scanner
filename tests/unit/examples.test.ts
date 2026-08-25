import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
