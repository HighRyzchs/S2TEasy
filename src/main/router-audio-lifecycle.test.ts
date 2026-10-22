import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterAudioClient } from './router-audio'

class FakeSocket extends EventTarget {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  static instances: FakeSocket[] = []
  readyState = 0
  sent: unknown[] = []
  constructor(_url: string) {
    super()
    FakeSocket.instances.push(this)
  }
  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }
  send(data: unknown) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
  }
  disconnect(code = 1000) {
    this.readyState = 3
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason: '' }))
  }
  transcript(text: string) {
    this.dispatchEvent(
      Object.assign(new Event('message'), {
        data: JSON.stringify({ type: 'transcript', text, is_final: true })
      })
    )
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeSocket.instances = []
})
const handlers = () => ({ onTranscript: vi.fn(), onError: vi.fn() })
const options = { apiKey: 'test', provider: 'auto' as const }
describe('stream lifecycle', () => {
  it('accepts finals arriving after the old half-second drain window', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const client = new RouterAudioClient(),
      callbacks = handlers()
    const connecting = client.connect(options, callbacks)
    const socket = FakeSocket.instances[0]!
    socket.open()
    await connecting
    const finishing = client.finish()
    await vi.advanceTimersByTimeAsync(1500)
    socket.transcript('last words')
    expect(callbacks.onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'last words' })
    )
    socket.disconnect()
    await finishing
    expect(callbacks.onError).not.toHaveBeenCalled()
  })
  it('reports an unexpected normal close instead of silently leaving recording active', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const client = new RouterAudioClient(),
      callbacks = handlers()
    const connecting = client.connect(options, callbacks)
    FakeSocket.instances[0]!.open()
    await connecting
    FakeSocket.instances[0]!.disconnect()
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/ended the stream/))
    client.close()
  })
  it('rejects a pre-open close promptly and allows cancellation while connecting', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const client = new RouterAudioClient()
    const connecting = client.connect(options, handlers())
    FakeSocket.instances[0]!.disconnect(4401)
    await expect(connecting).rejects.toThrow(/rejected/)
    client.close()
    const again = client.connect(options, handlers())
    client.close()
    await expect(again).rejects.toThrow(/cancelled/)
  })
})
