/** Central secret registry.
 *
 * Every value that came from an environment variable or a secret file is
 * registered here. Everything the tool ever writes — log lines, error
 * messages, the manifest, the summary — is piped through `mask()` first, so a
 * password can only ever leave the process as `***`.
 *
 * Masking covers the raw value plus its URL and JSON encodings, because a
 * credential typically reappears in a request URL or in a serialized error.
 */

export const MASK = '***'

const encodings = (value: string): string[] => {
  const out = new Set<string>([value])
  out.add(encodeURIComponent(value))
  out.add(encodeURI(value))
  out.add(JSON.stringify(value).slice(1, -1))
  out.add(Buffer.from(value, 'utf8').toString('base64'))
  return [...out].filter(v => v.length > 0)
}

export class SecretRegistry {
  /** longest first, so a secret that contains another one masks completely */
  private values: string[] = []

  add(value: string | undefined | null): void {
    if (!value) return
    for (const variant of encodings(value)) {
      if (!this.values.includes(variant)) this.values.push(variant)
    }
    this.values.sort((a, b) => b.length - a.length)
  }

  get size(): number {
    return this.values.length
  }

  /** Replace every registered secret (and its encodings) by `***`. */
  mask(text: string): string {
    let out = text
    for (const value of this.values) out = out.split(value).join(MASK)
    return out
  }

  /** Recursively mask every string inside an arbitrary JSON-like structure. */
  maskDeep<T>(input: T): T {
    if (typeof input === 'string') return this.mask(input) as unknown as T
    if (Array.isArray(input)) return input.map(item => this.maskDeep(item)) as unknown as T
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        out[this.mask(key)] = this.maskDeep(value)
      }
      return out as unknown as T
    }
    return input
  }

  /** Mask an error without losing its type information. */
  maskError(error: unknown): string {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return this.mask(text)
  }
}
