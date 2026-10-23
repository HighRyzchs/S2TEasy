import { globalShortcut } from 'electron'
import { parseHotkey, toElectronAccelerator } from '../shared/hotkey'
import type { HotkeyMode } from '../shared/types'

type Hooks = {
  onStart: () => void
  onStop: () => void
  onToggle: () => void
  /** Any other key press or mouse click anywhere (screen coordinates for clicks). */
  onInput?: (input: { kind: 'key' } | { kind: 'mouse'; x: number; y: number }) => void
}

type UiohookMod = {
  uIOhook: {
    on: (
      event: string,
      cb: (e: {
        keycode: number
        ctrlKey: boolean
        altKey: boolean
        shiftKey: boolean
        metaKey: boolean
        x: number
        y: number
      }) => void
    ) => void
    start: () => void
    stop: () => void
  }
  UiohookKey: Record<string, number>
}

function loadUiohook(): UiohookMod | null {
  try {
    return require('uiohook-napi') as UiohookMod
  } catch {
    return null
  }
}

const KEY_MAP: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace'
}

export class HotkeyManager {
  private hooks: Hooks | null = null
  private holdArmed = false
  private uio: UiohookMod | null = null
  private current = ''
  private mode: HotkeyMode = 'toggle'

  start(hooks: Hooks): void {
    this.hooks = hooks
    this.uio = loadUiohook()
    if (this.uio) {
      const { uIOhook } = this.uio
      uIOhook.on('keydown', (event) => this.onKey(event, true))
      uIOhook.on('keyup', (event) => this.onKey(event, false))
      uIOhook.on('mousedown', (event) => this.hooks?.onInput?.({ kind: 'mouse', x: event.x, y: event.y }))
      try {
        uIOhook.start()
      } catch (error) {
        console.error('S2Teasy: uiohook failed to start', error)
        this.uio = null
      }
    }
  }

  setBinding(accelerator: string, mode: HotkeyMode): void {
    const parsed = parseHotkey(accelerator)
    if (!parsed) throw new Error('Choose a valid global shortcut with a non-modifier key.')
    if (mode === 'hold' && !this.uio)
      throw new Error(
        'Hold-to-talk needs the native keyboard hook. Use toggle mode or reinstall native dependencies.'
      )
    if (this.current === parsed.accelerator && this.mode === mode) return
    const previous = this.current
    const electronAccel = toElectronAccelerator(parsed.accelerator)
    const wasToggle = this.mode === 'toggle' && !!previous
    if (mode === 'toggle') {
      // Try the new binding before releasing the previous one. Shortcut conflicts must be visible.
      if (previous !== parsed.accelerator || !wasToggle) {
        if (!globalShortcut.register(electronAccel, () => this.hooks?.onToggle()))
          throw new Error('That shortcut is already in use. Choose another combination.')
      }
    }
    if (wasToggle && (previous !== parsed.accelerator || mode !== 'toggle'))
      globalShortcut.unregister(toElectronAccelerator(previous))
    this.current = parsed.accelerator
    this.mode = mode
    this.holdArmed = false
  }

  stop(): void {
    globalShortcut.unregisterAll()
    try {
      this.uio?.uIOhook.stop()
    } catch {
      // ignore
    }
  }

  private onKey(
    event: {
      keycode: number
      ctrlKey: boolean
      altKey: boolean
      shiftKey: boolean
      metaKey: boolean
    },
    down: boolean
  ): void {
    if (!this.hooks) return
    const parsed = parseHotkey(this.current)
    if (!parsed) return
    const keycode = this.lookupKey(parsed.key)
    // The shortcut itself and bare modifiers are not typing into the target app.
    if (down && event.keycode !== keycode && !this.isModifier(event.keycode))
      this.hooks.onInput?.({ kind: 'key' })
    if (this.mode !== 'hold') return
    if (keycode == null || event.keycode !== keycode) return
    const modsOk =
      Boolean(event.ctrlKey) === parsed.modifiers.includes('Control') &&
      Boolean(event.shiftKey) === parsed.modifiers.includes('Shift') &&
      Boolean(event.altKey) === parsed.modifiers.includes('Alt') &&
      Boolean(event.metaKey) === parsed.modifiers.includes('Super')
    if (!modsOk && down) return
    if (down && !this.holdArmed) {
      this.holdArmed = true
      this.hooks.onStart()
    } else if (!down && this.holdArmed) {
      this.holdArmed = false
      this.hooks.onStop()
    }
  }

  private isModifier(keycode: number): boolean {
    const table = this.uio?.UiohookKey
    if (!table) return false
    return ['Ctrl', 'CtrlRight', 'Shift', 'ShiftRight', 'Alt', 'AltRight', 'Meta', 'MetaRight'].some(
      (name) => table[name] === keycode
    )
  }

  private lookupKey(key: string): number | null {
    const table = this.uio?.UiohookKey
    if (!table) return null
    const mapped = KEY_MAP[key] ?? key
    if (typeof table[mapped] === 'number') return table[mapped] ?? null
    if (key.length === 1) {
      const name = key.toUpperCase()
      if (typeof table[name] === 'number') return table[name] ?? null
    }
    return null
  }
}
