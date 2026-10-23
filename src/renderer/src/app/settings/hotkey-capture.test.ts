import { expect, it } from 'vitest'
import { captureHotkey, hotkeyKeys } from './hotkey-capture'

const press = (key: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods
})

it('accepts a modifier plus a key', () => {
  expect(captureHotkey(press(' ', { ctrlKey: true, shiftKey: true }))).toEqual({
    kind: 'ok',
    accelerator: 'Control+Shift+Space'
  })
})

it('waits while only modifiers are held', () => {
  expect(captureHotkey(press('Control', { ctrlKey: true }))).toEqual({ kind: 'ignore' })
})

it('cancels on a bare Escape but not on a combination that includes it', () => {
  expect(captureHotkey(press('Escape'))).toEqual({ kind: 'cancel' })
  expect(captureHotkey(press('Escape', { ctrlKey: true })).kind).toBe('ok')
})

it('refuses a plain letter, which would fire while typing, but allows function keys', () => {
  expect(captureHotkey(press('k')).kind).toBe('invalid')
  expect(captureHotkey(press('K', { shiftKey: true })).kind).toBe('invalid')
  expect(captureHotkey(press('F9'))).toEqual({ kind: 'ok', accelerator: 'F9' })
})

it('splits a shortcut into readable keys', () => {
  expect(hotkeyKeys('Control+Shift+Space')).toEqual(['Ctrl', 'Shift', 'Space'])
  expect(hotkeyKeys('Super+Alt+K')).toEqual(['Win', 'Alt', 'K'])
})
