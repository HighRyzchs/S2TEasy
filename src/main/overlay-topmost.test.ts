import { describe, expect, it } from 'vitest'
import { hwndFromHandle } from './overlay-topmost'

describe('hwndFromHandle', () => {
  it('reads a 64-bit HWND from an Electron native handle', () => {
    const buffer = Buffer.alloc(8)
    buffer.writeBigUInt64LE(0x00000000000abcden, 0)
    expect(hwndFromHandle(buffer)).toBe(0xabcden)
  })

  it('reads a 32-bit HWND', () => {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(0x00a1b2c3, 0)
    expect(hwndFromHandle(buffer)).toBe(0xa1b2c3n)
  })
})
