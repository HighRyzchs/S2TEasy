import { afterEach, describe, expect, it, vi } from 'vitest'
import { MicSession } from './mic'
import { captureFromSettings, defaultSettings } from '@shared/types'
const config = captureFromSettings(defaultSettings())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('microphone lifecycle and volume', () => {
  it('releases late permission results after cancel without starting an audio context', async () => {
    let resolve!: (stream: unknown) => void
    const getUserMedia = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const context = vi.fn()
    vi.stubGlobal('AudioContext', context)
    const track = { stop: vi.fn() }
    const mic = new MicSession({ onLevel: vi.fn(), onUtterance: vi.fn() })
    const pending = mic.start(config)
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await mic.stop()
    resolve({ getTracks: () => [track] })
    await pending
    expect(track.stop).toHaveBeenCalledOnce()
    expect(context).not.toHaveBeenCalled()
  })
  it('resumes audio and derives larger live bars from louder microphone samples', async () => {
    const track = { stop: vi.fn() }
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
    })
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 }, fftSize: 0 })
    const processor = { ...node(), onaudioprocess: null as null | ((event: unknown) => void) }
    const context = {
      state: 'suspended',
      sampleRate: 48000,
      destination: {},
      resume: vi.fn(async () => {
        context.state = 'running'
      }),
      close: vi.fn(async () => {
        context.state = 'closed'
      }),
      createMediaStreamSource: node,
      createGain: node,
      createAnalyser: node,
      audioWorklet: { addModule: vi.fn().mockRejectedValue(new Error('Use fallback')) },
      createScriptProcessor: () => processor
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return context
      })
    )
    const level = vi.fn()
    const mic = new MicSession({ onLevel: level, onUtterance: vi.fn() })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    await mic.start(config)
    expect(context.resume).toHaveBeenCalledOnce()
    for (const [time, amplitude] of [
      [1100, 0.01],
      [1200, 0.3]
    ]) {
      clock.mockReturnValue(time)
      processor.onaudioprocess!({
        inputBuffer: { getChannelData: () => new Float32Array(4096).fill(amplitude) }
      })
    }
    expect(level.mock.calls).toHaveLength(2)
    expect(level.mock.calls[1][0].rms).toBeGreaterThan(level.mock.calls[0][0].rms * 10)
    expect(Math.max(...level.mock.calls[1][0].bars)).toBeGreaterThan(
      Math.max(...level.mock.calls[0][0].bars)
    )
    await mic.stop()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })
  it('does not retry a denied microphone permission with another constraint set', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const mic = new MicSession({ onLevel: vi.fn(), onUtterance: vi.fn() })
    await expect(mic.start(config)).rejects.toThrow('Denied')
    expect(getUserMedia).toHaveBeenCalledOnce()
    await mic.stop()
  })
})
