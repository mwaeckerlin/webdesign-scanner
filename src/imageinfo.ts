/** Pixel dimensions of a written PNG, read straight from its header.
 *
 * The manifest states the real size of every image, so an analysis can tell a
 * retina rendering from a plain one without opening the file. A PNG carries
 * width and height in the IHDR chunk, which always follows the 8 byte
 * signature — no image library needed for that.
 */

import { openSync, readSync, closeSync, statSync } from 'node:fs'

import { renderingError } from './errors.js'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface ImageInfo {
  width: number
  height: number
  bytes: number
}

export const readPngInfo = (path: string): ImageInfo => {
  const header = Buffer.alloc(24)
  const handle = openSync(path, 'r')
  try {
    readSync(handle, header, 0, 24, 0)
  } finally {
    closeSync(handle)
  }
  if (!header.subarray(0, 8).equals(SIGNATURE) || header.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw renderingError(`not a png file: ${path}`)
  }
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    bytes: statSync(path).size
  }
}
