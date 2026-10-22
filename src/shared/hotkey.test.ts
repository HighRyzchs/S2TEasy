import { describe, expect, it } from 'vitest'
import { eventToAccelerator, formatHotkey, parseHotkey, toElectronAccelerator } from './hotkey'

describe('hotkey', () => {
  it('parses accelerator strings', () => {
    const parsed = parseHotkey('Control+Shift+Space')
    expect(parsed?.key).toBe('Space')
    expect(parsed?.modifiers).toContain('Control')
  })

  it('rejects modifier-only combos', () => {
    expect(parseHotkey('Control+Shift')).toBeNull()
  })

  it('maps browser events', () => {
    expect(
      eventToAccelerator({
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        key: ' '
      })
    ).toBe('Control+Shift+Space')
  })

  it('formats for display', () => {
    expect(formatHotkey('Control+Shift+Space')).toBe('Ctrl + Shift + Space')
  })

  it('converts to an Electron accelerator', () => {
    expect(toElectronAccelerator('Control+Shift+Space')).toBe('CommandOrControl+Shift+Space')
  })
})
