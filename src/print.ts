/** Print output: browser generated PDF plus a rendered image of every page.
 *
 * The PDF is what a reader would actually get from the browser's print
 * function, including print stylesheets. The page images exist because a
 * design review needs to look at the printed page — a text based reading of
 * a PDF hides exactly the things a print layout gets wrong: page breaks in
 * the wrong place, missing background graphics, a table that runs off the
 * paper.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from 'playwright'

import type { Config, Orientation, PaperFormat } from './config.js'
import { renderingError } from './errors.js'
import { readPngInfo } from './imageinfo.js'
import type { Logger } from './logging.js'
import { pdfName, pdfPageName, slug } from './naming.js'

export interface PdfArtifact {
  type: 'pdf'
  path: string
  format: PaperFormat
  orientation: Orientation
  pages: number
  scale: number
  printBackground: boolean
  preferCSSPageSize: boolean
  margin: { top: string; right: string; bottom: string; left: string }
  bytes: number
}

export interface PdfPageArtifact {
  type: 'pdf-page-image'
  path: string
  format: PaperFormat
  orientation: Orientation
  page: number
  dpi: number
  image: { width: number; height: number; bytes: number }
}

export type PrintArtifact = PdfArtifact | PdfPageArtifact

const run = (command: string, args: string[]): { status: number; stdout: string; stderr: string } => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) {
    const reason = (result.error as NodeJS.ErrnoException).code === 'ENOENT'
      ? `${command} is not installed (it comes with poppler-utils)`
      : result.error.message
    throw renderingError(`cannot run ${command}: ${reason}`)
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Fail early instead of after minutes of rendering. */
export const requirePrintTools = (config: Config): void => {
  if (!config.print.enabled) return
  run('pdfinfo', ['-v'])
  if (config.print.png.enabled) run('pdftoppm', ['-v'])
}

const pageCount = (path: string): number => {
  const info = run('pdfinfo', [path])
  const match = /^Pages:\s+(\d+)$/m.exec(info.stdout)
  if (!match) throw renderingError(`cannot determine the page count of ${path}`)
  return Number(match[1])
}

/** Render every page of a PDF into a PNG and give it a stable name. */
const renderPages = (
  pdfPath: string,
  pngDir: string,
  format: PaperFormat,
  orientation: Orientation,
  dpi: number
): string[] => {
  const prefix = `${slug(format)}-${slug(orientation)}-page`
  const result = run('pdftoppm', ['-png', '-r', String(dpi), pdfPath, join(pngDir, prefix)])
  if (result.status !== 0) {
    throw renderingError(`pdftoppm failed for ${pdfPath}: ${result.stderr.trim()}`)
  }
  const produced = readdirSync(pngDir)
    .filter(name => name.startsWith(`${prefix}-`) && name.endsWith('.png'))
    .map(name => ({ name, number: Number(/-(\d+)\.png$/.exec(name)?.[1] ?? '0') }))
    .sort((a, b) => a.number - b.number)

  return produced.map((item, index) => {
    const target = pdfPageName(format, orientation, index + 1)
    renameSync(join(pngDir, item.name), join(pngDir, target))
    return target
  })
}

export interface PrintContext {
  page: Page
  config: Config
  logger: Logger
  pdfDir: string
  pngDir: string
}

/** Produce every configured paper format in every configured orientation. */
export const capturePrint = async (context: PrintContext): Promise<PrintArtifact[]> => {
  const { page, config, logger } = context
  const artifacts: PrintArtifact[] = []

  for (const format of config.print.formats) {
    for (const orientation of config.print.orientations) {
      const file = pdfName(format, orientation)
      const path = join(context.pdfDir, file)
      logger.info(`printing ${format} ${orientation}`)
      await page.pdf({
        path,
        format,
        landscape: orientation === 'landscape',
        printBackground: config.print.printBackground,
        preferCSSPageSize: config.print.preferCSSPageSize,
        scale: config.print.scale,
        margin: config.print.margin
      })
      if (!existsSync(path)) throw renderingError(`the browser did not write ${path}`)

      const pages = pageCount(path)
      artifacts.push({
        type: 'pdf',
        path: join('print', 'pdf', file),
        format,
        orientation,
        pages,
        scale: config.print.scale,
        printBackground: config.print.printBackground,
        preferCSSPageSize: config.print.preferCSSPageSize,
        margin: config.print.margin,
        bytes: statSync(path).size
      })

      if (!config.print.png.enabled) continue
      const images = renderPages(path, context.pngDir, format, orientation, config.print.png.dpi)
      if (images.length !== pages) {
        logger.warn(`${file}: the pdf has ${pages} page(s) but ${images.length} image(s) were rendered`)
      }
      images.forEach((name, index) => {
        artifacts.push({
          type: 'pdf-page-image',
          path: join('print', 'png', name),
          format,
          orientation,
          page: index + 1,
          dpi: config.print.png.dpi,
          image: readPngInfo(join(context.pngDir, name))
        })
      })
    }
  }

  return artifacts
}
