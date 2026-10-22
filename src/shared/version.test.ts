import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion, parseVersion, tagToVersion } from './version'

describe('version', () => {
  it('parses dotted versions and tags', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.0.0-beta.1')).toEqual([1, 0, 0])
    expect(tagToVersion('v1.4.0')).toBe('1.4.0')
  })

  it('compares versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0)
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
  })
})
