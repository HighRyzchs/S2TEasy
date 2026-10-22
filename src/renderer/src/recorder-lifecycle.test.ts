import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordingCommand, defaultSettings, type RecordingCommand } from '@shared/types'
const factory = vi.hoisted(() => vi.fn())
vi.mock('./lib/api', () => ({ ensureApi: vi.fn() }))
vi.mock('./lib/mic', () => ({
  MicSession: class {
    constructor() {
      return factory()
    }
  }
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  factory.mockReset()
})
describe('recorder commands', () => {
  it('cancels a pending start immediately, allows a fresh session and ignores the stale rejection', async () => {
    let rejectOld!: (error: Error) => void
    const old = {
      start: vi.fn(
        () =>
          new Promise((_done, reject) => {
            rejectOld = reject
          })
      ),
      stop: vi.fn().mockResolvedValue(undefined)
    }
    const next = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    }
    factory.mockReturnValueOnce(old).mockReturnValueOnce(next)
    let command!: (value: RecordingCommand) => void
    const error = vi.fn()
    vi.stubGlobal('window', {
      s2t: {
        onCommand: (cb) => {
          command = cb
        },
        sendRecordingError: error
      }
    })
    await import('./recorder-main')
    const send = (action: RecordingCommand['action'], sessionId: number) =>
      command({ ...recordingCommand(action, defaultSettings()), sessionId })
    send('start', 1)
    await vi.waitFor(() => expect(old.start).toHaveBeenCalled())
    send('cancel', 2)
    expect(old.stop).toHaveBeenCalledOnce()
    send('start', 3)
    await vi.waitFor(() => expect(next.start).toHaveBeenCalled())
    rejectOld(new Error('Late permission failure'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(error).not.toHaveBeenCalled()
    expect(next.stop).not.toHaveBeenCalled()
    send('cancel', 4)
    expect(next.stop).toHaveBeenCalledOnce()
  })
})
