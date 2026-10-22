import { afterEach, expect, it, vi } from 'vitest'
const clipboard = vi.hoisted(() => ({
  text: 'previous',
  readText: vi.fn(() => clipboard.text),
  writeText: vi.fn((text: string) => {
    clipboard.text = text
  })
}))
vi.mock('electron', () => ({ clipboard }))
import { TextInjector, copyTranscript } from './inject'
afterEach(() => {
  vi.useRealTimers()
  clipboard.text = 'previous'
})
it('does not paste into the review window when review aborts an already-started insertion', async () => {
  vi.useFakeTimers()
  const bridge = {
    getForegroundWindow: () => 123,
    setForegroundWindow: () => true,
    sendCtrlV: vi.fn()
  }
  const injector = new TextInjector(bridge),
    abort = new AbortController()
  injector.captureTarget()
  const pending = injector.paste('late words', abort.signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  abort.abort()
  await vi.runAllTimersAsync()
  await rejected
  expect(bridge.sendCtrlV).not.toHaveBeenCalled()
  expect(clipboard.text).toBe('previous')
})
it('keeps a HUD Copy action even when it matches text temporarily placed on the clipboard for paste', async () => {
  vi.useFakeTimers()
  const bridge = {
    getForegroundWindow: () => 123,
    setForegroundWindow: () => true,
    sendCtrlV: vi.fn()
  }
  const injector = new TextInjector(bridge)
  injector.captureTarget()
  const pending = injector.paste('current transcript')
  await vi.advanceTimersByTimeAsync(40)
  copyTranscript('current transcript')
  await vi.runAllTimersAsync()
  await pending
  expect(clipboard.text).toBe('current transcript')
})
