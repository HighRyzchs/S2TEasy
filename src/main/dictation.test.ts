import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DictationController, LEAVE_MS } from './dictation'
import { SessionJournal } from './session-journal'
import type { CueAnalysis } from '../shared/speech-cues'
import { defaultSettings, type HistoryItem, type RecordingCommand } from '../shared/types'
import type { RouterAudioClient } from './router-audio'
import { VoiceMemoryService } from './voice-memory/service'
import { VoiceMemoryStore } from './voice-memory/store'
import { babble, GG_NO_RE, msOf, synth } from './voice-memory/test-audio'
import type { TranscribeInput } from './openrouter'

const dirs: string[] = []
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
  vi.useRealTimers()
})
function setup(
  overrides = {},
  injectorExtra: { targetApp?: () => string | null } = {},
  extra: { voiceMemory?: VoiceMemoryService } = {}
) {
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
    injector: { captureTarget: vi.fn(), paste, pasteBlock: paste, ...injectorExtra },
    transcribe,
    ...extra
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

describe('per-app speech cues', () => {
  it('turns cues on for a session in an app with an "on" rule, without changing saved settings', async () => {
    const t = setup(
      { appCues: { discord: true } },
      { targetApp: () => 'C:\\Apps\\Discord\\Discord.exe' }
    )
    await t.controller.start()
    expect(t.host.onOverlay).toHaveBeenCalledWith(expect.objectContaining({ status: 'listening', cues: true }))
    expect(t.settings.speechCues.automatic).toBe(false)
  })
})

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
    await vi.advanceTimersByTimeAsync(8000 + LEAVE_MS)
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
    await vi.advanceTimersByTimeAsync(8000 + LEAVE_MS)
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
it('lets the context check put back an accent swap that does not fit, before the draft is pasted', async () => {
  const t = setup({
    insertMode: 'final',
    accentContextCheck: true,
    vocabulary: [{ id: 'bite', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' }]
  })
  t.transcribe.mockResolvedValue('I ride my bike home')
  const checkAccents = vi.fn(async (_item: HistoryItem, text: string, slots: { start: number; end: number }[]) => ({
    text: text.slice(0, slots[0].start) + 'bike' + text.slice(slots[0].end),
    reverted: slots
  }))
  Object.assign(t.host, { checkAccents })
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  await t.controller.onUtterance('audio', gen)
  t.controller.stop()
  await t.controller.onFinished('', '', 1000, gen)
  expect(checkAccents).toHaveBeenCalledWith(expect.anything(), 'I ride my bite home', expect.any(Array), expect.anything(), expect.any(AbortSignal))
  expect(t.paste).toHaveBeenCalledWith('I ride my bike home', expect.any(AbortSignal))
  expect(t.history[0]).toMatchObject({ text: 'I ride my bike home', status: 'complete' })
  expect(t.history[0].fixes ?? []).toEqual([])
})

it('keeps the words as they are when the context check fails', async () => {
  const t = setup({
    insertMode: 'final',
    accentContextCheck: true,
    vocabulary: [{ id: 'bite', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' }]
  })
  t.transcribe.mockResolvedValue('grab a quick bike')
  Object.assign(t.host, { checkAccents: vi.fn().mockRejectedValue(new Error('HTTP 402')) })
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  await t.controller.onUtterance('audio', gen)
  t.controller.stop()
  await t.controller.onFinished('', '', 1000, gen)
  expect(t.history[0]).toMatchObject({ text: 'grab a quick bite', status: 'complete' })
})

it('hears speech cues per phrase while talking and saves them with the session', async () => {
  const t = setup({
    speechCues: { ...defaultSettings().speechCues, enabled: true, automatic: true },
    recoveryAudio: false
  })
  t.transcribe.mockResolvedValue('no way he said yes')
  const analyzeCueWindow = vi.fn(async (_item: HistoryItem, _settings: unknown, range: { startMs: number; endMs: number }) => ({
    quality: 'usable' as const,
    summary: 'Bright and quick.',
    cues: [
      { id: 'c', kind: 'emotion' as const, label: 'excited', strength: 'clear' as const, startMs: range.startMs, endMs: range.startMs + 900, evidence: 'pitch rises' }
    ],
    observations: { durationMs: range.endMs - range.startMs, rms: 0.1, clippedFraction: 0, quietIntervals: [] }
  }))
  Object.assign(t.host, { analyzeCueWindow })
  await t.controller.start()
  const gen = t.controller.currentGeneration()
  t.controller.onPcm(new Uint8Array(4000 * 32), gen)
  await t.controller.onUtterance('audio', gen)
  expect(analyzeCueWindow).toHaveBeenCalledWith(expect.anything(), expect.anything(), { startMs: 0, endMs: 4000 }, expect.any(AbortSignal))
  await vi.waitFor(() =>
    expect(t.host.onOverlay).toHaveBeenCalledWith(expect.objectContaining({ liveCues: [{ word: 0, label: 'excited' }] }))
  )
  t.controller.stop()
  await t.controller.onFinished('', '', 1000, gen)
  expect(t.analyzeCompleted).not.toHaveBeenCalled()
  expect(t.history[0].cueAnalysis?.cues).toMatchObject([{ label: 'excited', startMs: 0 }])
  expect(t.history[0].status).toBe('complete')
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

describe('personal words while typing live', () => {
  const s2 = { id: 's2', heard: 'as two teasy', meant: 'S2Teasy', enabled: true, kind: 'name' as const }
  const streaming = (overrides = {}) => {
    const t = setup({ sttEngine: 'router-audio', routerAudioKey: 'stream-key', vocabulary: [s2], ...overrides })
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
    const final = (text: string) => handlers.onTranscript({ kind: 'transcript', text, isPartial: false })
    return { ...t, controller, final }
  }
  const typed = (paste: ReturnType<typeof vi.fn>) => paste.mock.calls.map((call) => call[0])

  it('holds back a possible phrase start until the next phrase completes it', async () => {
    const t = streaming()
    await t.controller.start()
    t.final('demo the new as two')
    await Promise.resolve()
    await Promise.resolve()
    expect(typed(t.paste)).toEqual(['demo the new'])
    t.final('teasy overlay')
    await vi.waitFor(() => expect(typed(t.paste)).toEqual(['demo the new', 'S2Teasy overlay']))
    expect(t.history[0]?.text).toBe('demo the new S2Teasy overlay')
  })

  it('types held words at the end of the session and records what personal words fixed', async () => {
    const hits = vi.fn()
    const t = streaming()
    ;(t.host as { onVocabularyHits?: unknown }).onVocabularyHits = hits
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.final('tested as two teasy then as two')
    t.controller.stop()
    await t.controller.onFinished('', '', 1000, gen)
    expect(typed(t.paste)).toEqual(['tested S2Teasy then', 'as two'])
    expect(t.history[0]).toMatchObject({
      status: 'complete',
      text: 'tested S2Teasy then as two',
      rawText: 'tested as two teasy then as two',
      fixes: [{ entryId: 's2', from: 'as two teasy', to: 'S2Teasy' }]
    })
    expect(hits).toHaveBeenCalledWith([{ entryId: 's2', from: 'as two teasy', to: 'S2Teasy' }])
  })

  it('applies a word learned mid-session to what has not been typed yet', async () => {
    const t = streaming({ vocabulary: [] })
    await t.controller.start()
    t.final('talked to risks')
    t.controller.updateVocabulary([{ id: 'r', heard: 'risks', meant: 'Ryzchs', enabled: true }])
    t.final('and risks again')
    await vi.waitFor(() => expect(typed(t.paste)).toEqual(['talked to risks', 'and Ryzchs again']))
    expect(t.history[0]?.text).toBe('talked to risks and Ryzchs again')
  })

  it('sends what the user means to batch engines as hints, skipping accent swaps', async () => {
    const t = setup({
      vocabulary: [s2, { id: 'a', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' }]
    })
    await t.controller.start()
    await t.controller.onUtterance('audio', t.controller.currentGeneration())
    expect(t.transcribe.mock.calls[0]?.[0].vocabulary).toEqual(['S2Teasy'])
  })
})

describe('pause, resume and finishing on its own', () => {
  const batch = (overrides = {}) => {
    const t = setup(overrides)
    const replaceTail = vi.fn().mockResolvedValue(undefined)
    let untouched = true
    ;(t.host as Record<string, unknown>).targetUntouchedSince = () => untouched
    const controller = new DictationController(t.host, {
      injector: { captureTarget: vi.fn(), paste: t.paste, pasteBlock: t.paste, replaceTail },
      transcribe: t.transcribe
    })
    const state = () => t.host.onOverlay.mock.calls.at(-1)?.[0]
    return { ...t, controller, replaceTail, state, touch: () => (untouched = false) }
  }

  it('pauses on the shortcut, keeps one session across segments and finishes after the delay', async () => {
    vi.useFakeTimers()
    const t = batch({ finishAfterMs: 7000 })
    t.transcribe.mockResolvedValueOnce('first part').mockResolvedValueOnce('second part')
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    t.controller.onPcm(new Uint8Array([1, 2]), gen)
    await t.controller.onUtterance('a', gen)
    t.controller.toggle()
    expect(t.commands.at(-1)?.action).toBe('stop')
    await t.controller.onFinished('', '', 3000, gen)
    expect(t.controller.isPaused()).toBe(true)
    expect(t.state()).toMatchObject({ status: 'paused' })
    expect(t.history[0]).toMatchObject({ status: 'recording', text: 'first part' })

    t.controller.toggle()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.commands.at(-1)?.action).toBe('start')
    await t.controller.onUtterance('b', gen, 500)
    expect(t.transcribe.mock.calls[1]?.[0]).toBeDefined()
    t.controller.toggle()
    await t.controller.onFinished('', '', 2000, gen)
    expect(t.history).toHaveLength(1)
    expect(t.history[0]).toMatchObject({ text: 'first part second part', durationMs: 5000 })

    await vi.advanceTimersByTimeAsync(6900)
    expect(t.history[0]?.status).toBe('recording')
    await vi.advanceTimersByTimeAsync(200)
    expect(t.history[0]?.status).toBe('complete')
    expect(t.paste.mock.calls.map((call) => call[0])).toEqual(['first part', 'second part'])
  })

  it('holds the finish timer while the HUD is in use and finishes at once on Done', async () => {
    vi.useFakeTimers()
    const t = batch({ finishAfterMs: 4000 })
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    await t.controller.onUtterance('a', gen)
    t.controller.pause()
    await t.controller.onFinished('', '', 1000, gen)
    t.controller.holdFinish(true)
    expect(t.state()?.finishAt).toBeUndefined()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.controller.isPaused()).toBe(true)
    t.controller.holdFinish(false)
    expect(t.state()?.finishAt).toBeGreaterThan(Date.now())
    t.controller.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.history[0]?.status).toBe('complete')
  })

  it('replaces already-typed words in place only when the app was not touched since', async () => {
    const t = batch()
    t.transcribe.mockResolvedValue('talked to risks today')
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    await t.controller.onUtterance('a', gen)
    const id = t.history[0]!.id
    const start = 'talked to '.length
    const result = await t.controller.editText(id, start, start + 'risks'.length, 'Ryzchs')
    expect(result).toBe('typed')
    expect(t.replaceTail).toHaveBeenCalledWith(12, 'Ryzchs today ', expect.any(AbortSignal))
    expect(t.history[0]).toMatchObject({
      text: 'talked to Ryzchs today',
      edits: [{ from: 'risks', to: 'Ryzchs' }]
    })

    t.touch()
    const again = await t.controller.editText(id, 0, 'talked'.length, 'spoke')
    expect(again).toBe('kept-in-history')
    expect(t.replaceTail).toHaveBeenCalledTimes(1)
    expect(t.history[0]?.text).toBe('spoke to Ryzchs today')
    expect(t.state()?.notice).toMatch(/left alone/)
  })

  it('edits a draft without typing anything until it is inserted', async () => {
    const t = batch({ insertMode: 'final' })
    t.transcribe.mockResolvedValue('grab a quick bike')
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    await t.controller.onUtterance('a', gen)
    const id = t.history[0]!.id
    expect(await t.controller.editText(id, 13, 17, 'bite')).toBe('saved')
    expect(t.paste).not.toHaveBeenCalled()
    t.controller.stop()
    await t.controller.onFinished('', '', 1000, gen)
    expect(t.paste).toHaveBeenCalledWith('grab a quick bite', expect.any(AbortSignal))
  })

  it('rejects edits to a stale range or a finished session', async () => {
    const t = batch()
    await t.controller.start()
    const gen = t.controller.currentGeneration()
    await t.controller.onUtterance('a', gen)
    const id = t.history[0]!.id
    await expect(t.controller.editText(id, 2, 99, 'x')).rejects.toThrow(/changed/)
    await expect(t.controller.editText('other', 0, 1, 'x')).rejects.toThrow(/no longer open/)
  })

  it('keeps the old stop behavior for practice takes', async () => {
    const t = batch()
    await t.controller.startPractice('Ryzchs')
    t.controller.toggle()
    expect(t.state()?.status).toBe('transcribing')
    expect(t.controller.isPaused()).toBe(false)
  })
})

describe('voice memory (beta)', () => {
  // Engine words with timings for a synthetic sentence: babble "words", then the phrase, then more.
  function take(lead: number, seed: number, speed = 1) {
    const before = babble(lead, seed)
    const after = babble(4, seed + 1)
    const pcm = synth([...before, ...GG_NO_RE, ...after], { speed, seed })
    const t0 = msOf(before, speed)
    const sylls = GG_NO_RE.map((s) => s.ms * speed)
    const words = [
      { word: 'so', start: 0, end: t0 / 1000 },
      { word: 'Gigi', start: t0 / 1000, end: (t0 + sylls[0] + sylls[1]) / 1000 },
      { word: 'no', start: (t0 + sylls[0] + sylls[1]) / 1000, end: (t0 + sylls[0] + sylls[1] + sylls[2]) / 1000 },
      { word: 'read', start: (t0 + sylls[0] + sylls[1] + sylls[2]) / 1000, end: (t0 + msOf(GG_NO_RE, speed)) / 1000 },
      { word: 'man', start: (t0 + msOf(GG_NO_RE, speed)) / 1000, end: (t0 + msOf(GG_NO_RE, speed) + msOf(after, speed)) / 1000 }
    ].map((w) => ({ text: w.word, startMs: w.start * 1000, endMs: w.end * 1000 }))
    return { pcm, words, text: 'so Gigi no read man' }
  }

  function withMemory(mode: 'suggest' | 'auto') {
    const dir = mkdtempSync(join(tmpdir(), 's2teasy-voice-'))
    dirs.push(dir)
    const memory = new VoiceMemoryService(new VoiceMemoryStore(join(dir, 'voice.bin')))
    const t = setup({ voiceMemory: { enabled: true, mode, sensitivity: 0.5 } }, {}, { voiceMemory: memory })
    async function session(audio: ReturnType<typeof take>) {
      t.transcribe.mockImplementation(async (input: TranscribeInput) => {
        input.onWords?.(audio.words)
        return audio.text
      })
      await t.controller.start()
      const gen = t.controller.currentGeneration()
      t.controller.onPcm(audio.pcm, gen)
      await t.controller.onUtterance('audio', gen)
      return gen
    }
    return { t, memory, session }
  }

  const lastState = (t: ReturnType<typeof setup>) => t.host.onOverlay.mock.calls.at(-1)?.[0]

  it('remembers the sound of a HUD fix, then underlines the same phrase in a later session', async () => {
    const { t, memory, session } = withMemory('suggest')
    const gen = await session(take(8, 3))
    const id = t.history[0]!.id
    await t.controller.editText(id, 3, 3 + 'Gigi no read'.length, 'gg no re')
    expect(memory.list().memories).toMatchObject([{ intended: 'gg no re', heard: ['Gigi no read'] }])
    expect(lastState(t)?.notice).toMatch(/^Remembered how you say “gg no re”./)
    t.controller.stop()
    await t.controller.onFinished('', '', 1000, gen)

    await session(take(11, 9, 1.15))
    await vi.waitFor(() => expect(lastState(t)?.memoryHints).toHaveLength(1))
    expect(lastState(t)?.memoryHints?.[0]).toMatchObject({ text: 'Gigi no read', suggestion: 'gg no re' })
    expect(memory.list().recent[0]).toMatchObject({ intended: 'gg no re', outcome: 'suggested' })
  })

  it('in auto mode, fixes the phrase in the text when the evidence is strong', async () => {
    const { t, session } = withMemory('auto')
    const gen = await session(take(8, 3))
    await t.controller.editText(t.history[0]!.id, 3, 3 + 'Gigi no read'.length, 'gg no re')
    t.controller.stop()
    await t.controller.onFinished('', '', 1000, gen)
    await session(take(8, 3))
    await vi.waitFor(() => expect(t.history.at(-1)?.text).toBe('so gg no re man'))
  })

  it('learns nothing while voice memory is off', async () => {
    const { t, memory, session } = withMemory('suggest')
    t.settings.voiceMemory = { enabled: false, mode: 'suggest', sensitivity: 0.5 }
    await session(take(8, 3))
    await t.controller.editText(t.history[0]!.id, 3, 3 + 'Gigi no read'.length, 'gg no re')
    expect(memory.list().memories).toEqual([])
  })
})
