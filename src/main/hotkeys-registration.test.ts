import { beforeEach, describe, expect, it, vi } from 'vitest'
const shortcuts = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterAll: vi.fn()
}))
vi.mock('electron', () => ({ globalShortcut: shortcuts }))
import { HotkeyManager } from './hotkeys'
beforeEach(() => {
  vi.clearAllMocks()
  shortcuts.register.mockReturnValue(true)
})
describe('global shortcut registration', () => {
  it('retains the old shortcut when the new combination is already taken', () => {
    const manager = new HotkeyManager()
    manager.setBinding('Control+Shift+Space', 'toggle')
    shortcuts.register.mockReturnValueOnce(false)
    expect(() => manager.setBinding('Control+Alt+K', 'toggle')).toThrow(/already in use/)
    expect(shortcuts.unregister).not.toHaveBeenCalled()
  })
  it('does not re-register an unchanged shortcut during unrelated settings saves', () => {
    const manager = new HotkeyManager()
    manager.setBinding('Control+Shift+Space', 'toggle')
    manager.setBinding('Control+Shift+Space', 'toggle')
    expect(shortcuts.register).toHaveBeenCalledTimes(1)
  })
  it('does not silently convert unavailable hold mode into toggle', () => {
    expect(() => new HotkeyManager().setBinding('Control+Shift+Space', 'hold')).toThrow(
      /native keyboard hook/
    )
  })
})
