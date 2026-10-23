import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DictationController } from './dictation'
import { SessionJournal } from './session-journal'
import type { CueAnalysis } from '../shared/speech-cues'
import { defaultSettings, type HistoryItem, type RecordingCommand } from '../shared/types'
import type { RouterAudioClient } from './router-audio'

const dirs: string[] = []
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
  vi.useRealTimers()
})
function setup(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 's2teasy-controller-'))
  dirs.push(dir)
  const journal = new SessionJournal(dir)
  const history: HistoryItem[] = [],
    commands: RecordingCommand[] = []
  const paste = vi.fn().mockResolvedValue(undefined),
    transcribe = vi.fn().mockResolvedValue('hello')
  const settings = {
    ...defaultSettings(),
    sttEngine: 'openrouter' as const,
    apiKey: 'test-key',
    ...overrides
  }
  const analyzeCompleted = vi
    .fn<() => Promise<CueAnalysis | undefined>>()
    .mockResolvedValue(undefined)
  const host = {
    analyzeCompleted,
    journal,
    overlay: { hide: vi.fn(), showInactive: vi.fn(), isDestroyed: () => false },
    getSettings: () => settings,
    onHistoryItem: (item: HistoryItem) => {
      const i = history.findIndex((row) => row.id === item.id)
      if (i >= 0) history[i] = item
      else history.push(item)
    },
    onOverlay: vi.fn(),
    sendOverlayCommand: (command: RecordingCommand) => commands.push(command),
    placeOverlay: vi.fn()
  }
  const controller = new DictationController(host, {
    injector: { captureTarget: vi.fn(), paste, pasteBlock: paste },
    transcribe
  })
  return {
    controller,
    settings,
    history,
    journal,
    commands,
    paste,
    transcribe,
    host,
    analyzeCompleted
  }
}
const deferred = () => {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('recoverable dictation sessions', () => {
  it('saves finalized words before paste, retaining them and audio when paste fails', async () => {
    const t = setup()
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
    t.paste.mockImplementation(async () => {
      expect(t.history[0]?.text).toBe('hello')
      throw new Error('Target window is gone')
    })
    await t.controller.onUtterance('audio', gen)
    expect(t.history[0]).toMatchObject({
      text: 'hello',
      status: 'error',
      hasAudio: true,
      error: 'Target window is gone'
    })
    expect(t.journal.list(7)[0]?.text).toBe('hello')
  })

  it('serializes chunk requests and drains the final chunk before committing a two-minute session', async () => {
    vi.useFakeTimers()
    const t = setup()
    const first = deferred()
    t.transcribe
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce('world')
      .mockResolvedValueOnce('goodbye')
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    const a = t.controller.onUtterance('first', gen),
      b = t.controller.onUtterance('second', gen)
    await Promise.resolve()
    expect(t.transcribe).toHaveBeenCalledTimes(1)
    t.controller.stop()
    const finished = t.controller.onFinished('last', '', 120_000, gen)
    first.resolve('hello')
    await Promise.all([a, b, finished])
    expect(t.paste.mock.calls.map((call) => call[0])).toEqual(['hello', 'world', 'goodbye'])
    expect(t.history[0]).toMatchObject({
      text: 'hello world goodbye',
      durationMs: 120_000,
      status: 'complete',
      hasAudio: false
    })
    expect(t.controller.isBusy()).toBe(false)
  })

  it('does not start over a finishing session or accept stale recorder events', async () => {
    vi.useFakeTimers()
    const t = setup()
    const slow = deferred()
    t.transcribe.mockReturnValueOnce(slow.promise)
    await t.controller.start()
    const old = t.controller.currentGeneration()
    void t.controller.onUtterance('first', old)
    t.controller.stop()
    const finishing = t.controller.onFinished('', '', 1, old)
    await t.controller.start()
    expect(t.controller.currentGeneration()).toBe(old)
    slow.resolve('first session')
    await finishing
    await t.controller.start()
    expect(t.controller.currentGeneration()).toBeGreaterThan(old)
    t.controller.onPcm(new Uint8Array([1, 2]), old)
    await t.controller.onUtterance('stale', old)
    expect(t.history[1]?.text).toBe('')
    expect(t.journal.hasAudio(t.history[1]!.id)).toBe(false)
    t.controller.cancel()
  })

  it('recovers from a rejected paste queue in the next session', async () => {
    vi.useFakeTimers()
    const t = setup()
    t.paste.mockRejectedValueOnce(new Error('Paste failed'))
    await t.controller.start()
    await t.controller.onUtterance('first', t.controller.currentGeneration())
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    await t.controller.onUtterance('second', gen)
    t.controller.stop()
    await t.controller.onFinished('', '', 4, gen)
    expect(t.history.map((row) => row.status)).toEqual(['error', 'complete'])
  })

  it('keeps cancellation text without allowing an old request to insert', async () => {
    const t = setup()
    const slow = deferred()
    t.transcribe.mockReturnValueOnce(slow.promise)
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    const request = t.controller.onUtterance('first', gen)
    await Promise.resolve()
    t.controller.cancel()
    slow.resolve('late words')
    await request
    expect(t.paste).not.toHaveBeenCalled()
    expect(t.history[0]?.status).toBe('cancelled')
  })

  it('retains successful audio only with training retention enabled', async () => {
    vi.useFakeTimers()
    const t = setup({ keepAudioForTraining: true })
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.controller.onPcm(new Uint8Array([1, 2]), gen)
    await t.controller.onUtterance('audio', gen)
    t.controller.stop()
    await t.controller.onFinished('', '', 1, gen)
    expect(t.history[0]?.hasAudio).toBe(true)
  })

  it('snapshots engine settings and applies the vocabulary while preserving raw text', async () => {
    vi.useFakeTimers()
    const t = setup({
      vocabulary: [{ id: 'name', heard: 'rosin', meant: 'Roshan', enabled: true }]
    })
    t.transcribe.mockResolvedValue('hello rosin')
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.settings.model = 'changed-during-recording'
    await t.controller.onUtterance('audio', gen)
    t.controller.stop()
    await t.controller.onFinished('', '', 1, gen)
    expect(t.history[0]).toMatchObject({ text: 'hello Roshan', rawText: 'hello rosin' })
    expect(t.transcribe.mock.calls[0]?.[0].model).not.toBe('changed-during-recording')
  })

  it('saves stream finals before insertion and saves words when the connection fails', async () => {
    const t = setup({ sttEngine: 'router-audio', routerAudioKey: 'stream-key' })
    let handlers!: Parameters<RouterAudioClient['connect']>[1]
    const client = {
      connect: vi.fn(async (_options, callbacks) => {
        handlers = callbacks
      }),
      sendPcm: vi.fn(),
      close: vi.fn(),
      finish: vi.fn()
    }
    const controller = new DictationController(t.host, {
      injector: { captureTarget: vi.fn(), paste: t.paste, pasteBlock: t.paste },
      createStream: () => client as unknown as RouterAudioClient
    })
    await controller.start()
    handlers.onTranscript({ kind: 'transcript', text: 'kept words', isPartial: false })
    handlers.onError('Network disconnected')
    expect(t.history[0]).toMatchObject({ text: 'kept words', status: 'error' })
    expect(t.host.overlay.hide).not.toHaveBeenCalled()
  })
  it('records a labeled pronunciation take without any text insertion or global retention change', async () => {
    vi.useFakeTimers()
    const t = setup({ recoveryAudio: false, keepAudioForTraining: false })
    t.transcribe.mockResolvedValue('rosin')
    await t.controller.startPractice('Roshan')
    const gen = t.controller.currentGeneration()
    t.controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
    await t.controller.onUtterance('practice-audio', gen)
    t.controller.stop()
    await t.controller.onFinished('', '', 2000, gen)
    expect(t.paste).not.toHaveBeenCalled()
    expect(t.history[0]).toMatchObject({
      source: 'practice',
      practiceTarget: 'Roshan',
      text: 'Roshan',
      rawText: 'rosin',
      hasAudio: true,
      status: 'complete'
    })
    expect(t.settings.keepAudioForTraining).toBe(false)
    await t.controller.start()
    const next = t.controller.currentGeneration()
    await t.controller.onUtterance('normal-dictation', next)
    expect(t.paste).toHaveBeenCalledWith('rosin', expect.any(AbortSignal))
    t.controller.cancel()
  })

  it('dismissing an error keeps the failure details and the saved transcript', async () => {
    const t = setup()
    t.paste.mockRejectedValueOnce(new Error('Window closed'))
    await t.controller.start()
    await t.controller.onUtterance('audio', t.controller.currentGeneration())
    t.controller.cancel()
    expect(t.history[0]).toMatchObject({ text: 'hello', status: 'error', error: 'Window closed' })
    expect(t.host.overlay.hide).toHaveBeenCalled()
  })
  it('automatically hides a failure while retaining its recovery details and audio', async () => {
    vi.useFakeTimers()
    const t = setup()
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
    t.controller.recordingError('Device disconnected', gen)
    expect(t.host.onOverlay.mock.calls.at(-1)?.[0].status).toBe('error')
    await vi.advanceTimersByTimeAsync(8000)
    expect(t.host.overlay.hide).toHaveBeenCalledOnce()
    expect(t.host.onOverlay.mock.calls.at(-1)?.[0].status).toBe('hidden')
    expect(t.history[0]).toMatchObject({
      status: 'error',
      hasAudio: true,
      error: 'Device disconnected'
    })
    expect(t.journal.hasAudio(t.history[0]!.id)).toBe(true)
  })
  it('does not let an earlier failure timer hide a new recording', async () => {
    vi.useFakeTimers()
    const t = setup()
    await t.controller.start()
    t.controller.recordingError('Failed', t.controller.currentGeneration())
    await vi.advanceTimersByTimeAsync(4000)
    await t.controller.start()
    await vi.advanceTimersByTimeAsync(4100)
    expect(t.controller.isRecording()).toBe(true)
    expect(t.host.overlay.hide).not.toHaveBeenCalled()
    t.controller.cancel()
  })
  it('allows the hotkey to cancel finishing, aborts the request and prevents late insertion', async () => {
    vi.useFakeTimers()
    const t = setup()
    const slow = deferred()
    t.transcribe.mockReturnValueOnce(slow.promise)
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    const request = t.controller.onUtterance('first', gen)
    await Promise.resolve()
    const signal = t.transcribe.mock.calls[0][0].signal
    t.controller.stop()
    t.controller.toggle()
    expect(t.host.overlay.hide).toHaveBeenCalledOnce()
    expect(t.controller.isBusy()).toBe(false)
    expect(signal.aborted).toBe(true)
    slow.resolve('too late')
    await request
    expect(t.paste).not.toHaveBeenCalled()
    expect(t.history[0]?.status).toBe('cancelled')
  })
  it('fails and hides when the recorder never produces audio instead of hanging indefinitely', async () => {
    vi.useFakeTimers()
    const t = setup()
    await t.controller.start()
    await vi.advanceTimersByTimeAsync(21_000)
    expect(t.controller.isBusy()).toBe(false)
    expect(t.history[0]?.error).toContain('No microphone audio received')
    await vi.advanceTimersByTimeAsync(8000)
    expect(t.host.overlay.hide).toHaveBeenCalled()
  })
  it('does not reopen a disabled overlay on errors', async () => {
    vi.useFakeTimers()
    const t = setup({ showOverlay: false })
    await t.controller.start()
    t.controller.recordingError('Failed', t.controller.currentGeneration())
    expect(t.host.overlay.showInactive).not.toHaveBeenCalled()
  })
})

it('finishes into review without inserting late text into the now-focused editor', async () => {
  const t = setup()
  const onReview = vi.fn()
  Object.assign(t.host, { onReview })
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  t.controller.reviewCurrent()
  await t.controller.onFinished('tail', '', 600, gen)
  expect(onReview).toHaveBeenCalledWith(t.history[0].id)
  expect(t.history[0]).toMatchObject({ text: 'hello', status: 'complete' })
  expect(t.paste).not.toHaveBeenCalled()
})

it('retains unfinalized stream words and audio instead of deleting them on a seemingly successful stop', async () => {
  const t = setup({ sttEngine: 'router-audio', routerAudioKey: 'stream-key' })
  let handlers!: Parameters<RouterAudioClient['connect']>[1]
  const onUsage = vi.fn()
  Object.assign(t.host, { onUsage })
  const client = {
    connect: vi.fn(async (_options, callbacks) => {
      handlers = callbacks
    }),
    sendPcm: vi.fn(),
    close: vi.fn(),
    finish: vi.fn().mockResolvedValue(undefined)
  }
  const controller = new DictationController(t.host, {
    injector: { captureTarget: vi.fn(), paste: t.paste, pasteBlock: t.paste },
    createStream: () => client as unknown as RouterAudioClient
  })
  await controller.start()
  const gen = controller.currentGeneration()
  controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
  handlers.onTranscript({ kind: 'transcript', text: 'hello', isPartial: false })
  handlers.onTranscript({ kind: 'transcript', text: 'hello last words', isPartial: true })
  controller.stop()
  await controller.onFinished('', '', 1200, gen)
  expect(t.history[0]).toMatchObject({
    text: 'hello',
    unconfirmedText: 'last words',
    status: 'error',
    hasAudio: true
  })
  expect(t.journal.list(7)[0].unconfirmedText).toBe('last words')
  expect(onUsage).toHaveBeenCalledOnce()
  expect(onUsage).toHaveBeenCalledWith(
    expect.objectContaining({ costUsd: null, outcome: 'error', engine: 'router-audio' })
  )
  controller.cancel()
  expect(onUsage).toHaveBeenCalledOnce()
})

it('completes successfully when Review aborts an insertion already in its pre-paste delay', async () => {
  const t = setup({ insertMode: 'final' })
  t.paste.mockImplementation(
    (_text: string, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Review requested', 'AbortError')),
          { once: true }
        )
      })
  )
  await t.controller.start()
  const finishing = t.controller.onFinished('final', '', 1000, t.controller.currentGeneration())
  await vi.waitFor(() => expect(t.paste).toHaveBeenCalledOnce())
  t.controller.reviewCurrent()
  await finishing
  expect(t.history[0]).toMatchObject({ status: 'complete', text: 'hello', error: undefined })
})

it('keeps saved words and finishes if optional cue analysis fails; copy time never changes insertion', async () => {
  const prefs = { ...defaultSettings().speechCues, enabled: true, automatic: true }
  const t = setup({ speechCues: prefs, recoveryAudio: false, insertMode: 'final' })
  t.analyzeCompleted.mockImplementation(async () => {
    expect(t.history[0].text).toBe('hello')
    expect(t.journal.hasAudio(t.history[0].id)).toBe(true)
    throw new Error('Audio provider unavailable')
  })
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  t.controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
  await t.controller.onUtterance('audio', gen)
  t.controller.stop()
  await t.controller.onFinished('', '', 1000, gen)
  expect(t.history[0]).toMatchObject({
    text: 'hello',
    status: 'complete',
    hasAudio: false,
    cueError: 'Voice cues unavailable: Audio provider unavailable'
  })
  expect(t.paste).toHaveBeenCalledWith('hello', expect.any(AbortSignal))
  expect(t.analyzeCompleted).toHaveBeenCalledOnce()
  t.controller.cancel()
})
it('cancels pending cue analysis without saving a late result or pasting stale words', async () => {
  const t = setup({
    speechCues: { ...defaultSettings().speechCues, enabled: true, automatic: true },
    insertMode: 'final'
  })
  let resolve!: () => void
  t.analyzeCompleted.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = () => done(undefined)
      })
  )
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  await t.controller.onUtterance('audio', gen)
  t.controller.stop()
  const finishing = t.controller.onFinished('', '', 1000, gen)
  await vi.waitFor(() => expect(t.analyzeCompleted).toHaveBeenCalledOnce())
  t.controller.cancel()
  resolve()
  await finishing
  expect(t.history[0]).toMatchObject({ text: 'hello', status: 'cancelled' })
  expect(t.paste).not.toHaveBeenCalled()
  expect(t.host.onOverlay.mock.calls.at(-1)?.[0].status).toBe('hidden')
})

it('saves successful automatic cues to History and the HUD while expiring transient audio', async () => {
  const t = setup({
    speechCues: { ...defaultSettings().speechCues, enabled: true, automatic: true },
    recoveryAudio: false
  })
  const analysis: CueAnalysis = {
    schemaVersion: 1,
    id: 'cue-analysis',
    model: 'audio-model',
    createdAt: 1,
    startMs: 0,
    endMs: 1000,
    quality: 'usable',
    summary: 'Even delivery',
    observations: { durationMs: 1000, rms: 0.1, clippedFraction: 0, quietIntervals: [] },
    cues: [
      {
        id: 'cue-0',
        kind: 'delivery',
        label: 'monotone',
        startMs: 0,
        endMs: 1000,
        strength: 'clear',
        evidence: 'Limited pitch variation'
      }
    ]
  }
  t.analyzeCompleted.mockResolvedValue(analysis)
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  t.controller.onPcm(new Uint8Array([1, 2, 3, 4]), gen)
  await t.controller.onUtterance('audio', gen)
  t.controller.stop()
  await t.controller.onFinished('', '', 1000, gen)
  expect(t.history[0]).toMatchObject({
    text: 'hello',
    status: 'complete',
    hasAudio: false,
    cueAnalysis: analysis
  })
  expect(t.host.onOverlay.mock.calls.at(-1)?.[0]).toMatchObject({
    status: 'success',
    sessionId: t.history[0].id,
    cueAnalysis: analysis
  })
  t.controller.cancel()
})
