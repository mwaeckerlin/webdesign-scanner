import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/config.js'
import { ScannerError } from '../../src/errors.js'
import { Logger } from '../../src/logging.js'
import { discardResults, existingResults, outputDirs, prepareOutput } from '../../src/output.js'
import { SecretRegistry } from '../../src/secrets.js'

const logger = () => new Logger(new SecretRegistry(), 'error')

const workspace = () => mkdtempSync(join(tmpdir(), 'wds-out-'))

const config = (out: string, onExisting = 'fail') =>
  loadConfig({ TARGET_URL: 'https://example.com', OUT_DIR: out, ON_EXISTING: onExisting, VIEWPORTS: 'hd' })

describe('the output directory layout', () => {
  it('follows the documented structure', () => {
    const dirs = outputDirs('/out')
    expect(dirs.screenDir).toBe('/out/screen')
    expect(dirs.pdfDir).toBe('/out/print/pdf')
    expect(dirs.pngDir).toBe('/out/print/png')
    expect(dirs.metaDir).toBe('/out/meta')
    expect(dirs.debugDir).toBe('/out/debug')
  })

  it('creates every directory a run needs', () => {
    const out = workspace()
    const dirs = prepareOutput(config(out), logger())
    for (const dir of [dirs.screenDir, dirs.pdfDir, dirs.pngDir, dirs.metaDir]) expect(existsSync(dir)).toBe(true)
  })
})

describe('protection against overwriting an earlier run', () => {
  it('sees nothing to protect in an empty directory', () => {
    expect(existingResults(workspace())).toEqual([])
  })

  it('sees nothing to protect in a directory that does not exist yet', () => {
    expect(existingResults(join(workspace(), 'not-there'))).toEqual([])
  })

  it('recognises results from every result directory', () => {
    const out = workspace()
    for (const entry of ['screen', 'print', 'meta', 'debug']) {
      mkdirSync(join(out, entry), { recursive: true })
      writeFileSync(join(out, entry, 'file'), 'x', 'utf8')
    }
    expect(existingResults(out)).toEqual(['screen', 'print', 'meta', 'debug'])
  })

  it('ignores the empty result directories a prepared run leaves behind', () => {
    const out = workspace()
    prepareOutput(config(out), logger())
    expect(existingResults(out)).toEqual([])
  })

  it('finds a result file however deeply it is nested', () => {
    const out = workspace()
    const dirs = prepareOutput(config(out), logger())
    writeFileSync(join(dirs.pngDir, 'a4-portrait-p001.png'), 'x', 'utf8')
    expect(existingResults(out)).toEqual(['print'])
  })

  it('stops the run instead of mixing two states of a site', () => {
    const out = workspace()
    mkdirSync(join(out, 'screen'), { recursive: true })
    writeFileSync(join(out, 'screen', 'old.png'), 'x', 'utf8')
    try {
      prepareOutput(config(out), logger())
      expect.unreachable('an existing result set must stop the run')
    } catch (error) {
      expect((error as ScannerError).exitCode).toBe(3)
      expect((error as ScannerError).message).toMatch(/already holds results/)
    }
  })

  it('says how to proceed', () => {
    const out = workspace()
    mkdirSync(join(out, 'meta'), { recursive: true })
    writeFileSync(join(out, 'meta', 'manifest.json'), '{}', 'utf8')
    expect(() => prepareOutput(config(out), logger())).toThrow(/ON_EXISTING=overwrite/)
  })

  it('replaces the previous results only when it was asked to', () => {
    const out = workspace()
    mkdirSync(join(out, 'screen'), { recursive: true })
    writeFileSync(join(out, 'screen', 'old.png'), 'x', 'utf8')
    prepareOutput(config(out, 'overwrite'), logger())
    expect(existsSync(join(out, 'screen', 'old.png'))).toBe(false)
    expect(existsSync(join(out, 'screen'))).toBe(true)
  })

  it('leaves files outside the result directories alone', () => {
    const out = workspace()
    writeFileSync(join(out, 'notes.txt'), 'keep me', 'utf8')
    mkdirSync(join(out, 'screen'), { recursive: true })
    writeFileSync(join(out, 'screen', 'old.png'), 'x', 'utf8')
    prepareOutput(config(out, 'overwrite'), logger())
    expect(existsSync(join(out, 'notes.txt'))).toBe(true)
  })
})

describe('throwing away a half finished capture', () => {
  it('removes screenshots and print output but keeps the diagnosis', () => {
    const out = workspace()
    const dirs = prepareOutput(config(out), logger())
    writeFileSync(join(dirs.screenDir, 'a.png'), 'x', 'utf8')
    writeFileSync(join(dirs.pdfDir, 'a.pdf'), 'x', 'utf8')
    mkdirSync(dirs.debugDir, { recursive: true })
    writeFileSync(join(dirs.debugDir, 'failure.png'), 'x', 'utf8')

    discardResults(dirs)

    expect(existsSync(dirs.screenDir)).toBe(false)
    expect(existsSync(join(out, 'print'))).toBe(false)
    expect(existsSync(join(dirs.debugDir, 'failure.png'))).toBe(true)
    expect(existsSync(dirs.metaDir)).toBe(true)
  })
})
