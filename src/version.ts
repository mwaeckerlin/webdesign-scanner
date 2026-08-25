/** Tool name and version, read from the package manifest at runtime.
 *
 * Reading it instead of duplicating it keeps the number in the run manifest
 * identical to the released version — a report that names the wrong version
 * cannot be reproduced.
 */

import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
}

export const TOOL_NAME = packageJson.name
export const TOOL_VERSION = packageJson.version
