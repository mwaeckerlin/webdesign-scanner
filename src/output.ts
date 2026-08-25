/** Output directory layout, overwrite protection and failure cleanup.
 *
 * An existing result set is never silently replaced: a second run into the
 * same directory would mix images of two different states of a site, and a
 * comparison based on that is worthless. The run stops instead and says how
 * to proceed.
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { Config } from './config.js'
import { outputError } from './errors.js'
import type { Logger } from './logging.js'

export interface OutputDirs {
  outDir: string
  screenDir: string
  pdfDir: string
  pngDir: string
  metaDir: string
  debugDir: string
}

const RESULT_ENTRIES = ['screen', 'print', 'meta', 'debug']

export const outputDirs = (outDir: string): OutputDirs => ({
  outDir,
  screenDir: join(outDir, 'screen'),
  pdfDir: join(outDir, 'print', 'pdf'),
  pngDir: join(outDir, 'print', 'png'),
  metaDir: join(outDir, 'meta'),
  debugDir: join(outDir, 'debug')
})

/** True when the directory holds at least one file, however deeply nested.
 *
 * Empty directories do not count: a prepared but unused output directory —
 * `print/pdf` and `print/png` exist but nothing was written yet — is not a
 * previous result set and must not block the next run.
 */
const holdsFiles = (path: string): boolean => {
  if (!existsSync(path)) return false
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (holdsFiles(join(path, entry.name))) return true
      continue
    }
    return true
  }
  return false
}

/** Names of the result directories that already carry content. */
export const existingResults = (outDir: string): string[] => {
  if (!existsSync(outDir)) return []
  return RESULT_ENTRIES.filter(entry => holdsFiles(join(outDir, entry)))
}

export const prepareOutput = (config: Config, logger: Logger): OutputDirs => {
  const dirs = outputDirs(config.outDir)
  const existing = existingResults(config.outDir)

  if (existing.length > 0) {
    if (config.onExisting === 'fail') {
      throw outputError(
        `the output directory ${config.outDir} already holds results (${existing.join(', ')}); ` +
          'empty it, point OUT_DIR somewhere else, or set ON_EXISTING=overwrite'
      )
    }
    logger.warn(`replacing the previous results in ${config.outDir} (${existing.join(', ')})`)
    for (const entry of RESULT_ENTRIES) rmSync(join(config.outDir, entry), { recursive: true, force: true })
  }

  try {
    for (const dir of [dirs.outDir, dirs.metaDir]) mkdirSync(dir, { recursive: true })
    if (config.screenshots.enabled) mkdirSync(dirs.screenDir, { recursive: true })
    if (config.print.enabled) {
      mkdirSync(dirs.pdfDir, { recursive: true })
      if (config.print.png.enabled) mkdirSync(dirs.pngDir, { recursive: true })
    }
  } catch (error) {
    throw outputError(`cannot prepare the output directory ${config.outDir}: ${(error as Error).message}`)
  }

  return dirs
}

/** Throw away every capture artifact — used when a run fails halfway through. */
export const discardResults = (dirs: OutputDirs): void => {
  rmSync(dirs.screenDir, { recursive: true, force: true })
  rmSync(join(dirs.outDir, 'print'), { recursive: true, force: true })
}
