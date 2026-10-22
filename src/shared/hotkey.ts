const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'Super', 'Command', 'Cmd', 'Ctrl'])

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Control: 'Control',
  Ctrl: 'Control',
  Cmd: 'Command',
  CmdOrCtrl: 'CommandOrControl',
  Command: 'Command',
  Super: 'Super',
  Meta: 'Meta',
  Option: 'Alt',
  Return: 'Return',
  Enter: 'Enter'
}

export type ParsedHotkey = {
  modifiers: string[]
  key: string
  accelerator: string
}

export function normalizeKeyName(key: string): string {
  if (KEY_ALIASES[key]) return KEY_ALIASES[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function parseHotkey(accelerator: string): ParsedHotkey | null {
  const parts = accelerator
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => KEY_ALIASES[p] ?? (p.length === 1 ? p.toUpperCase() : p))
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]
  if (!key || MODIFIERS.has(key)) return null
  const modifiers = parts.slice(0, -1).map((m) => {
    if (m === 'Ctrl' || m === 'Control') return 'Control'
    if (m === 'Cmd' || m === 'Command' || m === 'Meta' || m === 'Super') return 'Super'
    return m
  })
  const unique = [...new Set(modifiers)]
  const acceleratorOut = [...unique, key].join('+')
  return { modifiers: unique, key, accelerator: acceleratorOut }
}

export function eventToAccelerator(event: {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  key: string
}): string | null {
  if (MODIFIERS.has(event.key) || event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
    return null
  }
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  if (event.metaKey) parts.push('Super')
  parts.push(normalizeKeyName(event.key))
  return parseHotkey(parts.join('+'))?.accelerator ?? null
}

export function toElectronAccelerator(accelerator: string): string {
  return accelerator
    .replaceAll('Control', 'CommandOrControl')
    .replaceAll('Super', 'Super')
}

export function formatHotkey(accelerator: string): string {
  return accelerator
    .replaceAll('Control', 'Ctrl')
    .replaceAll('Super', 'Win')
    .replaceAll('CommandOrControl', 'Ctrl')
    .replaceAll('+', ' + ')
}
