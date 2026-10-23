import { eventToAccelerator, formatHotkey } from '@shared/hotkey'

export type KeyEventLike = {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
}

export type Capture =
  | { kind: 'ignore' }
  | { kind: 'cancel' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; accelerator: string }

const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/

/** Judge one key press while the user is choosing a new shortcut. */
export function captureHotkey(event: KeyEventLike): Capture {
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey
  if (event.key === 'Escape' && !hasModifier && !event.shiftKey) return { kind: 'cancel' }
  const accelerator = eventToAccelerator(event)
  if (!accelerator) return { kind: 'ignore' }
  if (!hasModifier && !FUNCTION_KEY.test(event.key)) {
    return {
      kind: 'invalid',
      message: 'Add Ctrl, Alt or Win to the combination, or the shortcut would fire while you type.'
    }
  }
  return { kind: 'ok', accelerator }
}

/** The keys of a shortcut, one entry per key cap: Control+Shift+Space becomes Ctrl, Shift, Space. */
export function hotkeyKeys(accelerator: string): string[] {
  return formatHotkey(accelerator)
    .split(' + ')
    .map((key) => key.trim())
    .filter(Boolean)
}
