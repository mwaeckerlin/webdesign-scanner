import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { ScannerError } from '../../src/errors.js'
import { readPngInfo } from '../../src/imageinfo.js'

const workspace = mkdtempSync(join(tmpdir(), 'wds-png-'))

/** Build a real, standard conforming png of the given size. */
const png = (width: number, height: number): Buffer => {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  // rows of rgb pixels, each preceded by its filter byte
  const raw = Buffer.alloc(height * (1 + width * 3))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const write = (name: string, content: Buffer): string => {
  const path = join(workspace, name)
  writeFileSync(path, content)
  return path
}

describe('reading the pixel size of a written image', () => {
  it('reports width and height', () => {
    const info = readPngInfo(write('small.png', png(3, 2)))
    expect(info.width).toBe(3)
    expect(info.height).toBe(2)
  })

  it('reports the size of a large image without loading it', () => {
    const info = readPngInfo(write('large.png', png(3840, 2160)))
    expect(info.width).toBe(3840)
    expect(info.height).toBe(2160)
  })

  it('reports the file size in bytes', () => {
    const path = write('bytes.png', png(4, 4))
    expect(readPngInfo(path).bytes).toBeGreaterThan(0)
  })

  it('refuses a file that is not a png instead of reporting nonsense', () => {
    const path = write('fake.png', Buffer.from('this is not an image at all, not even close'))
    try {
      readPngInfo(path)
      expect.unreachable('a file that is not a png must be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(ScannerError)
      expect((error as ScannerError).exitCode).toBe(6)
    }
  })
})
