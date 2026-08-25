import { describe, expect, it } from 'vitest'

import { MASK, SecretRegistry } from '../../src/secrets.js'

describe('secret masking', () => {
  it('replaces a registered value everywhere in a text', () => {
    const secrets = new SecretRegistry()
    secrets.add('hunter2')
    expect(secrets.mask('login with hunter2 failed for hunter2')).toBe(`login with ${MASK} failed for ${MASK}`)
  })

  it('masks the value even when it was url encoded on the way', () => {
    const secrets = new SecretRegistry()
    secrets.add('pass word/&')
    expect(secrets.mask('https://host/?token=pass%20word%2F%26')).not.toContain('pass%20word')
  })

  it('masks the value even when it was json encoded on the way', () => {
    const secrets = new SecretRegistry()
    secrets.add('line"quote')
    expect(secrets.mask(JSON.stringify({ password: 'line"quote' }))).not.toContain('line\\"quote')
  })

  it('masks the base64 form, which is how basic authentication carries it', () => {
    const secrets = new SecretRegistry()
    secrets.add('topsecret')
    const encoded = Buffer.from('topsecret', 'utf8').toString('base64')
    expect(secrets.mask(`Authorization: Basic ${encoded}`)).not.toContain(encoded)
  })

  it('masks a longer secret first, so a shorter one cannot cut it in half', () => {
    const secrets = new SecretRegistry()
    secrets.add('pass')
    secrets.add('password123')
    expect(secrets.mask('password123')).toBe(MASK)
  })

  it('reaches every string of a nested structure, keys included', () => {
    const secrets = new SecretRegistry()
    secrets.add('s3cr3t')
    const masked = secrets.maskDeep({
      list: ['a s3cr3t value', { nested: 's3cr3t' }],
      s3cr3t: 'key names too',
      count: 3,
      flag: true,
      nothing: null
    })
    expect(JSON.stringify(masked)).not.toContain('s3cr3t')
    expect(masked.count).toBe(3)
    expect(masked.flag).toBe(true)
    expect(masked.nothing).toBeNull()
  })

  it('masks an error message without losing the error type', () => {
    const secrets = new SecretRegistry()
    secrets.add('hunter2')
    expect(secrets.maskError(new TypeError('bad hunter2'))).toBe(`TypeError: bad ${MASK}`)
  })

  it('ignores empty and missing values instead of masking everything', () => {
    const secrets = new SecretRegistry()
    secrets.add('')
    secrets.add(undefined)
    secrets.add(null)
    expect(secrets.size).toBe(0)
    expect(secrets.mask('nothing to hide')).toBe('nothing to hide')
  })

  it('counts a registered secret once, however often it is added', () => {
    const secrets = new SecretRegistry()
    secrets.add('abc')
    const first = secrets.size
    secrets.add('abc')
    expect(secrets.size).toBe(first)
  })
})
