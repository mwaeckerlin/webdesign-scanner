import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config.js'
import { ScannerError } from '../../src/errors.js'

const workspace = mkdtempSync(join(tmpdir(), 'wds-config-'))

const withFile = (name: string, content: string): string => {
  const path = join(workspace, name)
  writeFileSync(path, content, 'utf8')
  return path
}

const base = { TARGET_URL: 'https://example.com' }

afterAll(() => {
  // the temporary directory is small and disappears with the machine's tmp
})

describe('the target url', () => {
  it('comes from TARGET_URL', () => {
    expect(loadConfig(base).url).toBe('https://example.com')
  })

  it('comes from the configuration file when the environment says nothing', () => {
    const file = withFile('url.yaml', 'version: 1\nurl: https://from-file.test/\n')
    expect(loadConfig({ CONFIG_FILE: file }).url).toBe('https://from-file.test/')
  })

  it('is overridden by the environment', () => {
    const file = withFile('url2.yaml', 'version: 1\nurl: https://from-file.test/\n')
    expect(loadConfig({ ...base, CONFIG_FILE: file }).url).toBe('https://example.com')
  })

  it('is required', () => {
    expect(() => loadConfig({})).toThrow(/no target url/)
  })

  it('must be a url', () => {
    expect(() => loadConfig({ TARGET_URL: 'not a url' })).toThrow(/not a valid url/)
  })

  it('must use a scheme a browser can open', () => {
    expect(() => loadConfig({ TARGET_URL: 'ftp://example.com/' })).toThrow(/unsupported scheme/)
  })
})

describe('validation of the configuration file', () => {
  it('rejects a misspelled option instead of ignoring it', () => {
    const file = withFile('typo.yaml', 'version: 1\nscreenshots:\n  scrollSeriess: true\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/unknown option/)
  })

  it('names the full path of the offending option', () => {
    const file = withFile('typo2.yaml', 'version: 1\nprint:\n  png:\n    dpiii: 96\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/config\.print\.png\.dpiii/)
  })

  it('rejects a wrong type', () => {
    const file = withFile('type.yaml', 'version: 1\nscreenshots:\n  overlap: much\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/expected a number/)
  })

  it('rejects a value outside its range', () => {
    const file = withFile('range.yaml', 'version: 1\nscreenshots:\n  overlap: 0.95\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/at most 0.9/)
  })

  it('rejects a value that is not one of the allowed words', () => {
    const file = withFile('enum.yaml', 'version: 1\nnavigation:\n  waitUntil: eventually\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/expected one of/)
  })

  it('rejects a format version it does not understand', () => {
    const file = withFile('version.yaml', 'version: 99\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/version 1/)
  })

  it('rejects an unknown viewport name', () => {
    const file = withFile('vp.yaml', 'version: 1\nviewports:\n  presets:\n    - gigantic\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/unknown preset/)
  })

  it('rejects an unknown paper format', () => {
    const file = withFile('paper.yaml', 'version: 1\nprint:\n  formats:\n    - A9\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/unknown paper format/)
  })

  it('rejects a print viewport that is not configured', () => {
    const file = withFile('pv.yaml', 'version: 1\nviewports:\n  presets:\n    - hd\nprint:\n  viewport: uhd\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/not among the configured viewports/)
  })

  it('rejects a run that would capture nothing at all', () => {
    const file = withFile('none.yaml', 'version: 1\nscreenshots:\n  enabled: false\nprint:\n  enabled: false\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/nothing to capture/)
  })

  it('rejects two viewports with the same name', () => {
    const file = withFile('dup.yaml',
      'version: 1\nviewports:\n  presets:\n    - hd\n  custom:\n    - name: hd\n      width: 800\n      height: 600\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/duplicate viewport name/)
  })

  it('refuses to write the authenticated state into the results', () => {
    const file = withFile('state.yaml', 'version: 1\nout: /out\nworkflow:\n  storageStateOut: /out/state.json\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/must not be written into the output directory/)
  })

  it('sees through a detour that lands in the results after all', () => {
    const file = withFile('detour.yaml',
      'version: 1\nout: /out\nworkflow:\n  storageStateOut: /out/../out/state.json\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/must not be written into the output directory/)
  })

  it('sees through a relative path that lands in the results after all', () => {
    const file = withFile('relative.yaml',
      'version: 1\nout: ./out\nworkflow:\n  storageStateOut: out/state.json\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/must not be written into the output directory/)
  })

  it('leaves a storage state next to the results alone', () => {
    const file = withFile('sibling.yaml',
      'version: 1\nout: /out\nworkflow:\n  storageStateOut: /outside/state.json\n')
    expect(loadConfig({ ...base, CONFIG_FILE: file }).workflow.storageStateOut).toBe('/outside/state.json')
  })

  it('reports a broken file instead of falling back to defaults', () => {
    const file = withFile('broken.yaml', 'version: 1\n  bad indentation:\n- x\n')
    expect(() => loadConfig({ ...base, CONFIG_FILE: file })).toThrow(/cannot parse/)
  })

  it('reports a missing file', () => {
    expect(() => loadConfig({ ...base, CONFIG_FILE: join(workspace, 'nope.yaml') })).toThrow(/cannot read/)
  })

  it('classifies every configuration problem as a configuration error', () => {
    try {
      loadConfig({})
      expect.unreachable('a missing url must throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ScannerError)
      expect((error as ScannerError).exitCode).toBe(2)
    }
  })
})

describe('defaults', () => {
  it('captures every built-in viewport with its part widths', () => {
    const config = loadConfig(base)
    expect(config.viewports.presets).toHaveLength(14)
    expect(config.viewports.derived).toBe(true)
  })

  it('prints A3, A4, A5 and Letter in both orientations', () => {
    const config = loadConfig(base)
    expect(config.print.formats).toEqual(['A3', 'A4', 'A5', 'Letter'])
    expect(config.print.orientations).toEqual(['portrait', 'landscape'])
  })

  it('refuses to overwrite an existing result set', () => {
    expect(loadConfig(base).onExisting).toBe('fail')
  })

  it('writes to /out', () => {
    expect(loadConfig(base).outDir).toBe('/out')
  })

  it('leaves the browser sandbox to the container, which every host can deliver', () => {
    expect(loadConfig(base).browser.sandbox).toBe(false)
  })

  it('turns the browser sandbox on when it is asked to', () => {
    expect(loadConfig({ ...base, CHROMIUM_SANDBOX: 'true' }).browser.sandbox).toBe(true)
  })

  it('stops on an error page instead of analysing it', () => {
    expect(loadConfig(base).navigation.failOnErrorStatus).toBe(true)
  })

  it('prints from full-hd where it is configured', () => {
    expect(loadConfig(base).print.viewport).toBe('full-hd')
  })

  it('prints from the first configured viewport when full-hd is not among them', () => {
    const file = withFile('firstvp.yaml', 'version: 1\nviewports:\n  presets:\n    - phone-small\n    - hd\n')
    expect(loadConfig({ ...base, CONFIG_FILE: file }).print.viewport).toBe('phone-small')
  })
})

describe('environment overrides', () => {
  it('selects viewports', () => {
    expect(loadConfig({ ...base, VIEWPORTS: 'hd, phone-medium' }).viewports.presets).toEqual(['hd', 'phone-medium'])
  })

  it('selects paper formats and orientations', () => {
    const config = loadConfig({ ...base, PRINT_FORMATS: 'A5', PRINT_ORIENTATIONS: 'landscape' })
    expect(config.print.formats).toEqual(['A5'])
    expect(config.print.orientations).toEqual(['landscape'])
  })

  it('switches whole capture kinds off', () => {
    expect(loadConfig({ ...base, PRINT: 'false' }).print.enabled).toBe(false)
    expect(loadConfig({ ...base, SCREENSHOTS: 'false' }).screenshots.enabled).toBe(false)
  })

  it('changes the settle time and the output directory', () => {
    const config = loadConfig({ ...base, SETTLE_MS: '250', OUT_DIR: '/somewhere' })
    expect(config.stabilize.settleMs).toBe(250)
    expect(config.outDir).toBe('/somewhere')
  })

  it('drops the derived part widths on request', () => {
    expect(loadConfig({ ...base, DERIVED_VIEWPORTS: 'false' }).viewports.derived).toBe(false)
    expect(loadConfig({ ...base, DERIVED_VIEWPORTS: 'true' }).viewports.derived).toBe(true)
  })

  it('changes how long a slow site may take to answer', () => {
    expect(loadConfig({ ...base, NAVIGATION_TIMEOUT: '90000' }).navigation.timeout).toBe(90000)
    expect(() => loadConfig({ ...base, NAVIGATION_TIMEOUT: 'later' })).toThrow(/expected a number/)
  })

  it('changes how much the run says about itself', () => {
    expect(loadConfig({ ...base, LOG_LEVEL: 'debug' }).logLevel).toBe('debug')
    expect(() => loadConfig({ ...base, LOG_LEVEL: 'chatty' })).toThrow(/expected one of/)
  })

  it('takes an authenticated session in and writes one out', () => {
    const config = loadConfig({ ...base, STORAGE_STATE: '/in/state.json', STORAGE_STATE_OUT: '/tmp/out/state.json' })
    expect(config.workflow.storageStateIn).toBe('/in/state.json')
    expect(config.workflow.storageStateOut).toBe('/tmp/out/state.json')
  })

  it('rejects a value that is not a boolean', () => {
    expect(() => loadConfig({ ...base, PRINT: 'maybe' })).toThrow(/expected a boolean/)
  })

  it('rejects a value that is not a number', () => {
    expect(() => loadConfig({ ...base, SETTLE_MS: 'soon' })).toThrow(/expected a number/)
  })

  it('accepts a json configuration file as well as yaml', () => {
    const file = withFile('config.json', JSON.stringify({ version: 1, url: 'https://json.test/' }))
    expect(loadConfig({ CONFIG_FILE: file }).url).toBe('https://json.test/')
  })
})
