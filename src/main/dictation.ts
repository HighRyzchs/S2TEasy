import { vadFromSensitivity } from '../shared/vad'
import type { CueAnalysis } from '../shared/speech-cues'
import type { WordTiming } from '../shared/word-timing'
import type { UsageRecord } from '../shared/usage'
import { randomUUID } from 'node:crypto'
import { appFromPath, cuesForApp } from '../shared/apps'
import { startError } from '../shared/engine'
import {
  droppedTail,
  joinUtterances,
  normalizeTranscript,
  streamingAdvance,
  streamingPartial,
  withTrailingSpace
} from '../shared/transcript'
import {
  applyVocabulary,
  applyVocabularyDetailed,
  engineHintTerms,
  heldTailWords,
  type VocabularyEntry,
  type VocabularyHit
} from '../shared/vocabulary'
import {
  emptyOverlay,
  recordingCommand,
  resolveStreamingKey,
  type AppSettings,
  type AudioLevelPayload,
  type HistoryItem,
  type OverlayState,
  type RecordingCommand
} from '../shared/types'
import { TextInjector } from './inject'
import { transcribeAudio, type TranscribeInput } from './openrouter'
import { RouterAudioClient } from './router-audio'
import { SessionJournal } from './session-journal'
import { LiveCues, type CueWindowResult } from './live-cues'
import { accentSlots, type AccentSlot } from '../shared/accent-check'
import { applyThreshold, suggestThreshold, type Detection } from './voice-memory/memory'
import type { VoiceMemoryService } from './voice-memory/service'
import type { MemoryHint } from '../shared/voice-memory'
import { applyCommands, renderNext, renderStructure } from '../shared/structure'
import { describeTidy, mixedLanguageHint, scriptOnly, tidyAlways, tidyNext, tidySpeech, type TidySettings } from '../shared/tidy'

const MIC_SILENT =
  "Your microphone is silent: nothing reached speech level. Check the microphone in Settings → Microphone and Windows' input device (plugged-in earphones or a headset can take over)."

type Host = {
  overlay: { showInactive: () => void; hide: () => void; isDestroyed: () => boolean }
  getSettings: () => AppSettings
  onOverlay: (state: OverlayState) => void
  onHistoryItem: (item: HistoryItem) => void
  sendOverlayCommand: (payload: RecordingCommand) => void
  placeOverlay: () => void
  journal: SessionJournal
  isRecovering?: () => boolean
  onUsage?: (usage: UsageRecord) => void
  onReview?: (id: string) => void
  /** Fixes made by personal words in a completed session, for per-word statistics. */
  onVocabularyHits?: (hits: VocabularyHit[]) => void
  /**
   * True when nothing has touched the target app since `since` (no keys or clicks outside the HUD),
   * so text S2Teasy typed is still at the caret and can be replaced in place. Without it, never.
   */
  targetUntouchedSince?: (since: number) => boolean
  analyzeCompleted?: (
    item: HistoryItem,
    settings: AppSettings,
    signal: AbortSignal
  ) => Promise<CueAnalysis | undefined>
  /** Opt-in context check: which accent swaps to undo (text only, two choices per slot). */
  checkAccents?: (
    item: HistoryItem,
    text: string,
    slots: AccentSlot[],
    settings: AppSettings,
    signal: AbortSignal
  ) => Promise<{ text: string; reverted: AccentSlot[] }>
  /** Speech cues while talking: analyze one stretch of this session's journal audio. */
  analyzeCueWindow?: (
    item: HistoryItem,
    settings: AppSettings,
    range: { startMs: number; endMs: number },
    signal: AbortSignal
  ) => Promise<CueWindowResult | undefined>
}

type Dependencies = {
  injector: Pick<TextInjector, 'captureTarget' | 'paste' | 'pasteBlock'> &
    Partial<Pick<TextInjector, 'replaceTail' | 'restoreTarget' | 'targetApp'>>
  transcribe: (input: TranscribeInput) => Promise<string>
  createStream: () => RouterAudioClient
  /** Beta personal acoustic memory; absent in tests that do not exercise it. */
  voiceMemory?: VoiceMemoryService
}

/** A word the engine timed, on the session journal's clock (milliseconds of recorded audio). */
type TimedWord = { text: string; startMs: number; endMs: number }

const wordKey = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, '')
const wordsOf = (text: string) => text.split(/\s+/).map(wordKey).filter(Boolean)

/** The last place in `text` where `keys` (normalised words) appear in a row, as a character span. */
function findWords(text: string, keys: string[]): { start: number; end: number } | null {
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({ key: wordKey(m[0]), start: m.index, end: m.index + m[0].length }))
  for (let i = tokens.length - keys.length; i >= 0; i--)
    if (keys.every((key, k) => tokens[i + k].key === key))
      return { start: tokens[i].start, end: tokens[i + keys.length - 1].end }
  return null
}

/** How long the HUD's exit animation gets before its window hides. */
export const LEAVE_MS = 420

export class DictationController {
  private recording = false
  private busy = false
  private generation = 0
  private startedAt = 0
  private liveParts: string[] = []
  // Settled text: words that will not change any more except by the user's own edits (corrected),
  // and how many raw words that consumed. In live mode settled words are typed as they settle.
  private typedText = ''
  private typedRawWords = 0
  private hits: VocabularyHit[] = []
  // Live mode: exactly what S2Teasy has typed into the target app, and when it last typed.
  private targetText = ''
  // The live preview's latest full text, and words it heard at the end that the final left out.
  private lastHeard = ''
  private heardTail = ''
  private lastTypedAt = 0
  // The loudest microphone level heard this session, to tell a silent microphone from a quiet engine.
  private peakLevel = 0
  private silenceWarned = false
  // Pause/resume: a session is one or more recorded segments in the same History item.
  private pausing = false
  private paused = false
  private segmentStartMs = 0
  private finishTimer: NodeJS.Timeout | null = null
  private finishAt = 0
  private finishHeld = false
  private finishRemaining = 0
  private workChain: Promise<void> = Promise.resolve()
  private state: OverlayState = emptyOverlay()
  private hideTimer: NodeJS.Timeout | null = null
  private watchdog: NodeJS.Timeout | null = null
  private pasteAbort = new AbortController()
  private requestAbort: AbortController | null = null
  private liveCues: LiveCues | null = null
  // Voice memory: engine word timings on the journal clock, where the last check reached, and
  // detections already handled (by memory and position) so overlapping checks never repeat one.
  private timedWords: TimedWord[] = []
  private segmentJournalMs = 0
  private watchedToMs = 0
  private watching = false
  private finishAfterPause = false
  /** Pause or Done pressed while the engine was still connecting, applied once capture starts. */
  private afterConnect: 'pause' | 'stop' | null = null
  private handled: { memoryId: string; startMs: number }[] = []
  private liveCuesAbort: AbortController | null = null
  private journalBytes = 0
  private lastLevelAt = 0
  private stream: RouterAudioClient | null = null
  private item: HistoryItem | null = null
  private settings: AppSettings | null = null
  private failed = false
  private captureStarted = false
  private streamUsageRecorded = false
  private reviewRequested = false
  private practiceText: string | null = null
  private readonly dependencies: Dependencies

  constructor(
    private readonly host: Host,
    dependencies: Partial<Dependencies> = {}
  ) {
    this.dependencies = {
      injector: new TextInjector(),
      transcribe: transcribeAudio,
      createStream: () => new RouterAudioClient(),
      ...dependencies
    }
  }

  isRecording(): boolean {
    return this.recording
  }
  isBusy(): boolean {
    return this.busy
  }
  currentGeneration(): number {
    return this.generation
  }

  /**
   * The shortcut starts, pauses and resumes. A paused session finishes by itself after the finish
   * delay (or with Done); pressing during finishing cancels it. Practice takes stop on the shortcut.
   */
  toggle(): void {
    if (this.recording) {
      if (this.practiceText) this.stop()
      else this.pause()
    } else if (this.paused) void this.resume()
    else if (this.busy) this.cancel()
    else void this.start()
  }

  /** Hold-to-talk: pressing starts or resumes; releasing pauses. */
  holdStart(): void {
    if (this.paused) void this.resume()
    else if (!this.busy) void this.start()
  }
  holdEnd(): void {
    if (!this.recording) return
    if (this.practiceText) this.stop()
    else this.pause()
  }

  isPaused(): boolean {
    return this.paused
  }

  /** Give focus back to the app the session types into, after editing in the HUD. */
  /** Give the keyboard back to the app being dictated into. False when there is none or Windows refused. */
  restoreTarget(): boolean {
    return this.dependencies.injector.restoreTarget?.() ?? false
  }

  pause(): void {
    if (!this.recording || this.pausing) return
    if (!this.captureStarted) {
      // Still connecting: a session that already has words pauses once the microphone is open;
      // an empty one is simply cancelled.
      if (this.hasWords()) this.afterConnect = 'pause'
      else this.cancel()
      return
    }
    this.pausing = true
    this.finishAfterPause = false
    this.afterConnect = null
    this.recording = false
    this.clearWatchdog()
    this.setState({ ...this.state, status: 'transcribing', message: 'Pausing', rms: 0, bars: [] })
    this.command('stop')
  }

  async resume(): Promise<void> {
    if (!this.paused || !this.settings || !this.item) return
    const gen = this.generation
    this.clearFinishTimer()
    this.paused = false
    this.finishHeld = false
    this.recording = true
    this.captureStarted = false
    this.setState({ ...this.state, status: 'listening', message: 'Listening', finishAt: undefined })
    try {
      await this.beginSegment(gen)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  /** Done: finish now. While recording this stops capture first; while paused it completes. */
  finish(): void {
    if (this.paused) void this.completeFromPause()
    // Done while a pause is still settling the last words: finish as soon as they are in.
    else if (this.pausing) this.finishAfterPause = true
    else if (this.recording) this.stop()
  }

  /** The HUD holds the finish timer while the user hovers or edits, and releases it after. */
  holdFinish(held: boolean): void {
    if (!this.paused || held === this.finishHeld) return
    this.finishHeld = held
    if (held) {
      this.finishRemaining = Math.max(1500, this.finishAt - Date.now())
      this.clearFinishTimer()
      this.setState({ ...this.state, finishAt: undefined })
    } else this.startFinishTimer(this.finishRemaining)
  }

  /** Speech cues for this session only, from the HUD switch. */
  setSessionCues(on: boolean): void {
    if (!this.settings || !this.busy) return
    this.settings.speechCues = { ...this.settings.speechCues, enabled: on, automatic: on }
    if (!on) this.stopLiveCues()
    this.setState({ ...this.state, cues: on, liveCues: on ? this.state.liveCues : undefined })
    if (on && !this.liveCues && !this.practiceText) this.startLiveCues()
  }

  /**
   * With the context check on, ask once whether each accent swap fits its sentence and put back the
   * heard word where it does not. The words are already saved; a failed check changes nothing.
   */
  private async checkAccentSwaps(gen: number): Promise<void> {
    const check = this.host.checkAccents
    if (!check || !this.settings?.accentContextCheck || this.practiceText || !this.item) return
    const slots = accentSlots(this.typedText, this.vocabulary(), this.hits)
    if (!slots.length) return
    this.setState({ ...this.state, status: 'transcribing', message: 'Words saved · checking accent fixes', rms: 0, bars: [] })
    let result: { text: string; reverted: AccentSlot[] }
    try {
      result = await check(this.item, this.typedText, slots, this.settings, this.requestAbort!.signal)
    } catch {
      return
    }
    if (!this.valid(gen) || !result.reverted.length) return
    this.typedText = result.text
    for (const slot of result.reverted) {
      const i = this.hits.findIndex((hit) => hit.entryId === slot.entryId)
      if (i >= 0) this.hits.splice(i, 1)
    }
    this.updateText()
    const words = result.reverted.map((slot) => `“${slot.heard}”`).join(', ')
    if (this.liveTyping() && !this.reviewRequested) {
      let outcome = ''
      await this.enqueue(gen, async () => {
        outcome = await this.replaceTyped()
      })
      if (outcome === 'typed') this.notice(`Context check put back ${words}.`)
    } else this.notice(`Context check put back ${words}.`)
  }

  /** Whether this session already holds words, so stopping it early must not throw them away. */
  private hasWords(): boolean {
    return this.liveParts.length > 0 || this.segmentStartMs > 0 || !!this.typedText
  }

  /** Journal audio recorded so far in this session, in milliseconds (16 kHz mono PCM16). */
  private journalMs(): number {
    return Math.floor(this.journalBytes / 32)
  }

  private startLiveCues(): void {
    const analyze = this.host.analyzeCueWindow
    const item = this.item
    const settings = this.settings
    if (!analyze || !item || !settings || !this.requestAbort) return
    const gen = this.generation
    this.liveCuesAbort = new AbortController()
    this.liveCues = new LiveCues({
      analyze: (range, signal) => analyze(item, settings, range, signal),
      signal: AbortSignal.any([this.requestAbort.signal, this.liveCuesAbort.signal]),
      model: settings.speechCues.model,
      startMs: this.journalMs(),
      onCues: (liveCues) => {
        if (gen === this.generation && this.busy) this.setState({ ...this.state, liveCues })
      }
    })
  }

  private addTimedWords(words: WordTiming[], offsetMs: number): void {
    if (!this.settings?.voiceMemory.enabled) return
    for (const word of words)
      this.timedWords.push({ text: word.text, startMs: word.startMs + offsetMs, endMs: word.endMs + offsetMs })
    if (this.timedWords.length > 20_000) this.timedWords.splice(0, this.timedWords.length - 20_000)
  }

  /**
   * Where the engine said `words` (normalised), on the journal clock. With several occurrences the
   * one whose position in the session best matches `index` (words before it in the text) wins.
   */
  private locateWords(words: string[], index: number): { startMs: number; endMs: number; text: string } | null {
    if (!words.length) return null
    const keys = this.timedWords.map((word) => wordKey(word.text))
    let best = -1
    for (let i = 0; i + words.length <= keys.length; i++)
      if (words.every((word, k) => keys[i + k] === word))
        if (best === -1 || Math.abs(i - index) < Math.abs(best - index)) best = i
    if (best === -1) return null
    const run = this.timedWords.slice(best, best + words.length)
    return { startMs: run[0].startMs, endMs: run[run.length - 1].endMs, text: run.map((word) => word.text).join(' ') }
  }

  /** A short excerpt of this session's audio around [startMs, endMs), with context for normalisation. */
  private excerpt(startMs: number, endMs: number, before = 3000, after = 1000): { pcm: Uint8Array; offsetMs: number } | null {
    if (!this.item) return null
    const to = Math.min(this.journalMs(), endMs + after)
    const from = Math.max(0, startMs - before, to - 30_000)
    if (to - from < 200) return null
    try {
      return { pcm: this.host.journal.readPcmExcerpt(this.item.id, { startMs: from, endMs: to }), offsetMs: from }
    } catch {
      return null
    }
  }

  /**
   * Voice memory: a fix of a few words binds the sound the engine heard there to the words you
   * wanted. Rewrites of longer passages are not pronunciation evidence and are skipped. Returns the
   * HUD message for the fix, or null when voice memory is not involved.
   */
  private learnSound(heard: string, intended: string, index: number): string | null {
    const memory = this.dependencies.voiceMemory
    if (!memory || !this.settings?.voiceMemory.enabled || !this.item || !heard || !intended) return null
    const heardWords = wordsOf(heard)
    if (heardWords.length > 6 || wordsOf(intended).length > 6) return null
    const place = this.locateWords(heardWords, index)
    const clip = place && this.excerpt(place.startMs - 80, place.endMs + 80)
    const learned =
      !!place &&
      !!clip &&
      memory.remember({
        pcm: clip.pcm,
        fromMs: place.startMs - 80 - clip.offsetMs,
        toMs: place.endMs + 80 - clip.offsetMs,
        heard: place.text,
        intended,
        sessionId: this.item.id,
        source: 'correction'
      })
    return learned
      ? `Remembered how you say “${intended}”.`
      : 'Fixed. Its sound could not be found, so only the words were changed.'
  }

  /**
   * Voice memory: check the speech recorded since the last check (with overlap, so a phrase split
   * across checks is still found) for anything you taught it. Runs after typing, never before it.
   */
  private async watchVoice(gen: number): Promise<void> {
    const memory = this.dependencies.voiceMemory
    const prefs = this.settings?.voiceMemory
    if (!memory || !prefs?.enabled || this.practiceText || !this.item || this.watching) return
    const end = this.journalMs()
    if (!memory.hasMemories() || end - this.watchedToMs < 600) return
    this.watching = true
    try {
      await new Promise((resolve) => setImmediate(resolve))
      const from = Math.max(0, this.watchedToMs - 1500)
      const clip = this.excerpt(from, end, 3000, 0)
      if (!clip || !this.valid(gen)) return
      const hits = memory.detect(clip.pcm, from - clip.offsetMs, suggestThreshold(prefs.sensitivity))
      this.watchedToMs = end
      for (const hit of hits) {
        const at = { ...hit, startMs: hit.startMs + clip.offsetMs, endMs: hit.endMs + clip.offsetMs }
        if (this.handled.some((h) => h.memoryId === at.memoryId && Math.abs(h.startMs - at.startMs) < 400)) continue
        this.handled.push({ memoryId: at.memoryId, startMs: at.startMs })
        if (!this.valid(gen)) return
        await this.placeDetection(gen, at)
      }
    } catch {
      // Voice memory is an extra: a failed check never disturbs dictation.
    } finally {
      this.watching = false
    }
  }

  /** Turn a detection on the audio clock into a suggestion or a fix in the session text. */
  private async placeDetection(gen: number, hit: Detection): Promise<void> {
    const memory = this.dependencies.voiceMemory!
    const prefs = this.settings!.voiceMemory
    const words = this.timedWords.filter((word) => {
      const overlap = Math.min(word.endMs, hit.endMs) - Math.max(word.startMs, hit.startMs)
      return overlap > 0.4 * Math.max(1, word.endMs - word.startMs)
    })
    const event = { at: Date.now(), intended: hit.intended, score: Math.round(hit.score * 1000) / 1000 }
    if (!words.length) {
      memory.record({ ...event, heard: '', outcome: 'unplaced' })
      this.notice(`Sounds like you said “${hit.intended}”.`)
      return
    }
    const heard = words.map((word) => word.text).join(' ')
    const keys = words.map((word) => wordKey(word.text)).filter(Boolean)
    if (keys.join(' ') === wordsOf(hit.intended).join(' ')) {
      memory.record({ ...event, heard, outcome: 'already-right' })
      return
    }
    const display = this.displayText()
    const span = findWords(display, keys)
    if (!span || wordsOf(display.slice(span.start, span.end)).join(' ') === wordsOf(hit.intended).join(' ')) {
      memory.record({ ...event, heard, outcome: span ? 'already-right' : 'unplaced' })
      return
    }
    if (!this.valid(gen)) return
    if (prefs.mode === 'auto' && hit.score <= applyThreshold(prefs.sensitivity) && this.item) {
      await this.editText(this.item.id, span.start, span.end, hit.intended, false)
      memory.record({ ...event, heard, outcome: 'applied' }, hit.memoryId)
      this.notice(`Heard your “${hit.intended}”.`)
      return
    }
    const hint: MemoryHint = { ...span, text: display.slice(span.start, span.end), suggestion: hit.intended }
    this.setState({ ...this.state, memoryHints: [...(this.state.memoryHints ?? []), hint].slice(-6) })
    memory.record({ ...event, heard, outcome: 'suggested' }, hit.memoryId)
    this.notice(`Sounds like “${hit.intended}”. Click it to fix.`)
  }

  private stopLiveCues(): void {
    this.liveCuesAbort?.abort()
    this.liveCuesAbort = null
    this.liveCues = null
  }

  /**
   * Replace characters [start, end) of the session text with the user's correction. Everything heard
   * so far settles first so the edit lands on stable text. In live mode the typed text is replaced in
   * place only when nothing else has touched the target app since S2Teasy last typed there; otherwise
   * the fix is kept in History and the app's text is left alone.
   */
  async editText(
    sessionId: string,
    start: number,
    end: number,
    replacement: string,
    learn = true
  ): Promise<'typed' | 'saved' | 'kept-in-history'> {
    if (!this.busy || !this.item || this.item.id !== sessionId || this.practiceText || this.failed)
      throw new Error('This session is no longer open for edits.')
    const gen = this.generation
    const chunk = this.settle(true)
    const text = this.typedText
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length)
      throw new Error('That part of the text has changed. Try the edit again.')
    const next = normalizeTranscript(text.slice(0, start) + replacement.replace(/\s+/g, ' ') + text.slice(end))
    const from = text.slice(start, end).trim()
    const learned = learn ? this.learnSound(from, replacement.trim(), wordsOf(text.slice(0, start)).length) : null
    this.typedText = next
    if (from || replacement.trim())
      this.item.edits = [...(this.item.edits ?? []), { from, to: replacement.trim() }].slice(-200)
    this.updateText()
    if (!this.liveTyping()) {
      if (learned) this.notice(learned)
      return 'saved'
    }
    if (chunk) await this.enqueue(gen, () => this.typeLive(chunk))
    let result: 'typed' | 'kept-in-history' = 'typed'
    await this.enqueue(gen, async () => {
      result = await this.replaceTyped()
    })
    const outcome = result as 'typed' | 'kept-in-history'
    if (learned)
      this.notice(outcome === 'kept-in-history' ? `${learned} The app’s text changed since, so it was left alone.` : learned)
    return outcome
  }

  async startPractice(intendedText: string): Promise<void> {
    if (this.busy || this.host.isRecovering?.())
      throw new Error('Finish the current recording first.')
    if (typeof intendedText !== 'string' || !intendedText.trim() || intendedText.length > 200)
      throw new Error('Enter a word or short phrase, up to 200 characters.')
    await this.start({ intendedText: intendedText.trim() })
  }

  async start(practice?: { intendedText: string }): Promise<void> {
    if (this.busy || this.host.isRecovering?.()) return
    const settings = structuredClone(this.host.getSettings())
    this.practiceText = practice?.intendedText ?? null
    if (practice) {
      settings.insertMode = 'final'
      settings.keepAudioForTraining = true
      settings.recoveryAudio = true
    }
    const problem = startError(settings)
    if (problem) {
      this.showError(problem)
      return
    }
    this.clearHide()
    this.clearWatchdog()
    this.requestAbort?.abort()
    this.requestAbort = new AbortController()
    this.pasteAbort = new AbortController()
    const gen = ++this.generation
    this.busy = true
    this.recording = true
    this.failed = false
    this.captureStarted = false
    this.reviewRequested = false
    this.streamUsageRecorded = false
    this.settings = settings
    this.startedAt = Date.now()
    this.liveParts = []
    this.typedText = ''
    this.typedRawWords = 0
    this.hits = []
    this.targetText = ''
    this.lastHeard = ''
    this.heardTail = ''
    this.lastTypedAt = 0
    this.peakLevel = 0
    this.silenceWarned = false
    this.pausing = false
    this.paused = false
    this.segmentStartMs = 0
    this.journalBytes = 0
    this.afterConnect = null
    this.stopLiveCues()
    this.timedWords = []
    this.segmentJournalMs = 0
    this.watchedToMs = 0
    this.handled = []
    this.finishHeld = false
    this.clearFinishTimer()
    this.workChain = Promise.resolve()
    this.dependencies.injector.captureTarget()
    this.item = {
      id: randomUUID(),
      text: '',
      rawText: '',
      model:
        settings.sttEngine === 'router-audio'
          ? `router.audio/${settings.routerProvider}`
          : settings.sttEngine === 'local'
            ? `local/${settings.localModel}`
            : settings.model,
      createdAt: this.startedAt,
      durationMs: 0,
      source: practice ? 'practice' : settings.insertMode,
      practiceTarget: practice?.intendedText,
      status: 'recording',
      app: practice ? undefined : appFromPath(this.dependencies.injector.targetApp?.())
    }
    if (!practice) {
      const fallback = settings.speechCues.enabled && settings.speechCues.automatic
      const on = cuesForApp(settings.appCues, this.item.app, fallback)
      if (on !== fallback) settings.speechCues = { ...settings.speechCues, enabled: on, automatic: on }
    }
    try {
      this.checkpoint()
      this.setState({
        ...emptyOverlay(),
        sessionId: this.item.id,
        status: 'listening',
        message: settings.sttEngine === 'router-audio' ? 'Connecting' : 'Listening',
        cues: settings.speechCues.enabled && settings.speechCues.automatic
      })
      if (!practice && settings.speechCues.enabled && settings.speechCues.automatic) this.startLiveCues()
      this.host.placeOverlay()
      if (settings.showOverlay) this.host.overlay.showInactive()
      await this.beginSegment(gen)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  /** Connect the engine (streaming) and start capture for one recorded segment of the session. */
  private async beginSegment(gen: number): Promise<void> {
    const settings = this.settings!
    {
      if (settings.sttEngine === 'router-audio') {
        const client = this.dependencies.createStream()
        this.stream = client
        await client.connect(
          {
            apiKey: resolveStreamingKey(settings),
            provider: settings.routerProvider,
            language: settings.language,
            keyterms: settings.streamKeyterms ? engineHintTerms(settings.vocabulary, 50) : undefined,
            mixedLanguages: settings.streamMixedLanguages ? settings.tidy.languages.map((l) => l.code) : undefined
          },
          {
            onTranscript: (event) => {
              try {
                this.onStreamTranscript(event.text, event.isPartial, gen, event.words)
              } catch (error) {
                this.fail(errorMessage(error), gen)
              }
            },
            onError: (message) => this.fail(message, gen)
          }
        )
      }
      if (gen !== this.generation || !this.recording) return
      this.setState({ ...this.state, message: 'Listening' })
      this.captureStarted = true
      this.lastLevelAt = Date.now()
      this.segmentJournalMs = this.journalMs()
      this.command('start')
      const queued = this.afterConnect
      this.afterConnect = null
      if (queued === 'pause') this.pause()
      else if (queued === 'stop') this.stop()
      this.watchdog = setInterval(() => {
        if (this.recording && Date.now() - this.lastLevelAt > 20_000)
          this.fail(
            'No microphone audio received. Check microphone permission and device, then try again. Any saved work is in History.',
            gen
          )
      }, 1000)
    }
  }

  stop(): void {
    if (!this.recording) return
    if (!this.captureStarted) {
      if (this.hasWords()) this.afterConnect = 'stop'
      else this.cancel()
      return
    }
    this.recording = false
    this.clearWatchdog()
    const gen = this.generation
    this.watchdog = setTimeout(
      () => this.fail('Finishing timed out. Recover any saved audio from History.', gen),
      180_000
    )
    this.setState({ ...this.state, status: 'transcribing', message: 'Finishing' })
    this.command('stop')
  }

  cancel(): void {
    this.clearFinishTimer()
    this.paused = false
    this.pausing = false
    this.recordStreamUsage('cancelled')
    this.pasteAbort.abort()
    ++this.generation
    this.recording = false
    this.busy = false
    this.failed = true
    this.requestAbort?.abort()
    this.clearWatchdog()
    this.stream?.close()
    this.stream = null
    this.command('cancel')
    if (this.item && (this.item.status === 'recording' || this.item.status === 'processing')) {
      if (this.practiceText) this.item.text = this.practiceText
      this.item.status = 'cancelled'
      this.item.error =
        'Cancelled. Any saved text and recovery audio are kept until you delete them.'
      try {
        this.checkpoint()
      } catch {
        this.item.error =
          'Could not save cancellation to disk. Earlier checkpoints may still be available.'
        this.host.onHistoryItem({ ...this.item })
      }
    }
    this.setState(emptyOverlay())
    this.clearHide()
    if (!this.host.overlay.isDestroyed()) this.host.overlay.hide()
  }

  recordingError(message: string, gen: number): void {
    this.fail(message, gen)
  }

  setLevel(payload: AudioLevelPayload | number, gen = this.generation): void {
    if (gen !== this.generation || !this.recording) return
    this.lastLevelAt = Date.now()
    const level = typeof payload === 'number' ? payload : payload.rms
    this.peakLevel = Math.max(this.peakLevel, level)
    if (!this.silenceWarned && this.micSilent() && Date.now() - this.startedAt > 6000) {
      this.silenceWarned = true
      this.notice(MIC_SILENT)
    }
    this.setState({
      ...this.state,
      rms: level,
      bars: typeof payload === 'number' ? this.state.bars : payload.bars,
      elapsedMs: Date.now() - this.startedAt
    })
  }

  onPcm(bytes: Uint8Array, gen = this.generation): void {
    if (gen !== this.generation || !this.busy || this.failed || !this.item) return
    try {
      if (
        this.settings?.recoveryAudio ||
        this.settings?.keepAudioForTraining ||
        (this.settings?.speechCues.enabled && this.settings.speechCues.automatic) ||
        this.settings?.voiceMemory.enabled
      ) {
        this.host.journal.append(this.item.id, bytes)
        this.journalBytes += bytes.length
      }
      this.stream?.sendPcm(bytes)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  onUtterance(wavBase64: string, gen: number, startMs = 0): Promise<void> {
    if (gen !== this.generation || this.settings?.sttEngine === 'router-audio')
      return Promise.resolve()
    // One ordered queue for network responses and insertion. A rejected paste never poisons future sessions.
    const offset = this.segmentStartMs + startMs
    return this.enqueue(gen, async () => {
      const text = await this.transcribe(wavBase64, gen, offset)
      if (!this.valid(gen)) return
      await this.acceptFinal(text, gen)
    })
  }

  async onFinished(
    leftoverBase64: string,
    _fullBase64: string,
    durationMs: number,
    gen: number,
    leftoverStartMs = 0
  ): Promise<void> {
    if (!this.valid(gen)) return
    const pausing = this.pausing
    this.recording = false
    try {
      if (this.item) {
        this.item.durationMs = this.segmentStartMs + durationMs
        if (!pausing) this.item.status = 'processing'
        this.checkpoint()
      }
      if (!pausing) this.setState({ ...this.state, status: 'transcribing', message: 'Finishing' })
      if (this.stream) {
        const stream = this.stream
        await stream.finish()
        if (gen === this.generation) this.stream = null
      }
      if (!this.valid(gen)) return
      if (leftoverBase64 && this.settings?.sttEngine !== 'router-audio')
        await this.onUtterance(leftoverBase64, gen, leftoverStartMs)
      await this.workChain
      this.segmentStartMs += durationMs
      if (!this.valid(gen) || !this.item || !this.settings) return
      if (pausing && this.finishAfterPause) {
        this.pausing = false
        this.finishAfterPause = false
        this.item.status = 'processing'
        this.setState({ ...this.state, status: 'transcribing', message: 'Finishing' })
        await this.complete(gen)
        return
      }
      if (pausing) {
        this.pausing = false
        this.paused = true
        this.checkpoint()
        this.setState({ ...this.state, status: 'paused', message: 'Paused', rms: 0, bars: [] })
        this.startFinishTimer(this.finishDelay())
        return
      }
      await this.complete(gen)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  private async completeFromPause(): Promise<void> {
    const gen = this.generation
    if (!this.paused || !this.item) return
    this.paused = false
    this.clearFinishTimer()
    this.item.status = 'processing'
    this.setState({ ...this.state, status: 'transcribing', message: 'Finishing', finishAt: undefined })
    try {
      await this.complete(gen)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  /** Everything after the last audio is in: type held words, analyze, insert (draft mode), save. */
  private async complete(gen: number): Promise<void> {
    if (!this.valid(gen) || !this.item || !this.settings) return
    // The end of the take: words the preview heard but the engine never finalised (often a soft,
    // trailing last word) are kept rather than lost or sending the take to review.
    this.rescueTail()
    // Type any words held back as a possible phrase start; no more speech can complete them.
    if (!this.practiceText) {
      const chunk = this.settle(true)
      this.updateText()
      if (chunk) await this.enqueue(gen, () => this.typeLive(chunk))
      if (!this.valid(gen)) return
      const tidy = this.autoTidy()
      if (tidy) await this.applyTidy(gen, false, tidy)
      if (!this.valid(gen) || !this.item) return
    }
    if (this.item.unconfirmedText?.trim()) {
      this.fail(
        'The provider did not finalize the last words. Unconfirmed text and retained audio are kept in History for review.',
        gen
      )
      return
    }
    if (!this.item.text.trim()) {
      this.fail(
        this.micSilent() ? MIC_SILENT : 'No finalized speech received. Recover retained audio from History.',
        gen
      )
      return
    }
    await this.checkAccentSwaps(gen)
    if (!this.valid(gen)) return
    // Words are durable before optional audio interpretation. Its failure must not lose dictation.
    const live = this.liveCues
    if (
      this.settings.speechCues.enabled &&
      this.settings.speechCues.automatic &&
      (live || this.host.analyzeCompleted)
    ) {
      this.setState({
        ...this.state,
        status: 'transcribing',
        message: live ? 'Words saved · finishing speech cues' : 'Words saved · listening for delivery',
        rms: 0,
        bars: []
      })
      try {
        const analysis = live
          ? await live.finish(this.journalMs())
          : await this.host.analyzeCompleted!(this.item, this.settings, this.requestAbort!.signal)
        if (!this.valid(gen)) return
        this.item.cueAnalysis = analysis
      } catch (error) {
        if (!this.valid(gen)) return
        this.item.cueError = `Voice cues unavailable: ${errorMessage(error)}`
      }
    }
    // Persist before attempting any final insertion; focus/clipboard failures cannot erase text.
    this.checkpoint()
    if (!this.practiceText && !this.reviewRequested && this.settings.insertMode === 'final') {
      try {
        await this.dependencies.injector.paste(renderStructure(this.item.text), this.pasteAbort.signal)
      } catch (error) {
        if (!(
          this.reviewRequested &&
          this.pasteAbort.signal.aborted &&
          error instanceof Error &&
          error.name === 'AbortError'
        ))
          throw error
      }
    }
    if (this.practiceText) this.item.text = this.practiceText
    if (!this.valid(gen)) return
    this.recordStreamUsage('success')
    const hits = this.practiceText
      ? applyVocabularyDetailed(this.item.rawText ?? '', this.vocabulary()).hits
      : this.hits
    if (hits.length) {
      this.item.fixes = hits.slice(0, 200)
      this.host.onVocabularyHits?.(hits)
    }
    this.item.status = 'complete'
    this.item.error = undefined
    if (!this.settings.keepAudioForTraining) this.host.journal.removeAudio(this.item.id)
    this.checkpoint()
    this.busy = false
    this.clearWatchdog()
    this.setState({
      ...this.state,
      status: 'success',
      partial: this.item.text,
      message: this.practiceText
        ? 'Practice take saved'
        : this.reviewRequested
          ? 'Saved for review'
          : this.settings.insertMode === 'live'
            ? 'Saved & typed'
            : 'Saved & inserted',
      elapsedMs: this.item.durationMs,
      rms: 0,
      bars: [],
      finishAt: undefined
    })
    this.scheduleHide(2200)
  }

  private finishDelay(): number {
    const ms = this.settings?.finishAfterMs ?? 7000
    return Math.min(30_000, Math.max(2000, ms))
  }

  private startFinishTimer(ms: number): void {
    this.clearFinishTimer()
    if (this.finishHeld) return
    this.finishAt = Date.now() + ms
    this.finishTimer = setTimeout(() => void this.completeFromPause(), ms)
    this.setState({ ...this.state, finishAt: this.finishAt })
  }

  private clearFinishTimer(): void {
    if (this.finishTimer) clearTimeout(this.finishTimer)
    this.finishTimer = null
  }

  async insertNow(text: string): Promise<void> {
    if (this.busy) throw new Error('Finish the current dictation before inserting from History.')
    this.busy = true
    this.pasteAbort = new AbortController()
    const gen = ++this.generation
    this.clearHide()
    this.setState({
      ...emptyOverlay(),
      status: 'arm-paste',
      partial: text,
      message: 'Click a text field…'
    })
    this.host.placeOverlay()
    this.host.overlay.showInactive()
    try {
      await new Promise((resolve) => setTimeout(resolve, 1600))
      if (gen !== this.generation) return
      this.dependencies.injector.captureTarget()
      await this.dependencies.injector.paste(text, this.pasteAbort.signal)
      if (gen !== this.generation) return
      this.setState({ ...emptyOverlay(), status: 'success', partial: text, message: 'Inserted' })
      this.scheduleHide()
    } catch (error) {
      if (gen === this.generation) this.showError(errorMessage(error))
      throw error
    } finally {
      if (gen === this.generation) this.busy = false
    }
  }

  private recordStreamUsage(outcome: UsageRecord['outcome']): void {
    if (this.settings?.sttEngine !== 'router-audio' || !this.item || this.streamUsageRecorded)
      return
    this.streamUsageRecorded = true
    try {
      this.host.onUsage?.({
        id: `stream-${this.item.id}`,
        operationId: this.item.id,
        sessionId: this.item.id,
        source: 'dictation',
        createdAt: this.startedAt,
        engine: 'router-audio',
        model: this.item.model,
        costUsd: null,
        durationMs: this.item.durationMs,
        latencyMs: Date.now() - this.startedAt,
        attempt: 1,
        outcome
      })
    } catch {
      /* Usage must not erase speech. */
    }
  }

  private valid(gen: number): boolean {
    return gen === this.generation && this.busy && !this.failed
  }

  reviewCurrent(): void {
    if (!this.item) return
    this.reviewRequested = true
    this.pasteAbort.abort()
    if (this.recording) this.stop()
    this.host.overlay.hide()
    this.host.onReview?.(this.item.id)
  }

  private transcribe(wavBase64: string, gen: number, startMs: number): Promise<string> {
    const settings = this.settings!
    const sessionId = this.item!.id
    // The same utterance on the journal clock, fixed now: a later segment may start before it returns.
    const journalOffset = startMs - this.segmentStartMs + this.segmentJournalMs
    return this.dependencies.transcribe({
      apiKey: settings.apiKey,
      model: settings.sttEngine === 'local' ? settings.localModel : settings.model,
      language: settings.language,
      mixedLanguages: mixedLanguageHint(settings.tidy),
      wavBase64,
      engine: settings.sttEngine === 'local' ? 'local' : 'openrouter',
      localEndpoint: settings.localEndpoint,
      route: settings.openrouterRoute,
      signal: this.requestAbort?.signal,
      requestWordTimings: settings.requestWordTimings,
      onWords: (words) => {
        if (this.valid(gen)) this.addTimedWords(words, journalOffset)
        if (this.valid(gen) && this.item)
          this.item.words = [
            ...(this.item.words ?? []),
            ...words.map((word) => ({
              ...word,
              startMs: word.startMs + startMs,
              endMs: word.endMs + startMs
            }))
          ].slice(-20_000)
      },
      onUsage: (usage) => this.host.onUsage?.({ ...usage, sessionId, source: 'dictation' }),
      vocabulary: engineHintTerms(settings.vocabulary)
    })
  }

  private onStreamTranscript(
    text: string,
    partial: boolean,
    gen: number,
    words?: WordTiming[]
  ): void {
    if (!this.valid(gen)) return
    const committed = joinUtterances(this.liveParts)
    if (partial) {
      const heard = streamingPartial(committed, text)
      this.lastHeard = heard
      // New words are being heard: an earlier dropped tail is part of what comes next.
      if (heard.length > committed.length) this.heardTail = ''
      if (this.item) {
        this.item.unconfirmedText = streamingAdvance(
          committed,
          streamingPartial(committed, text)
        ).delta
        this.checkpoint()
      }
      this.setState({ ...this.state, partial: this.displayText(streamingPartial(committed, text)) })
      return
    }
    if (this.item) {
      this.item.unconfirmedText = undefined
      if (words?.length) this.addTimedWords(words, this.segmentJournalMs)
      if (words?.length)
        this.item.words = [
          ...(this.item.words ?? []),
          ...words.map((word) => ({
            ...word,
            startMs: word.startMs + this.segmentStartMs,
            endMs: word.endMs + this.segmentStartMs
          }))
        ].slice(-20_000)
    }
    const { delta } = streamingAdvance(committed, text)
    // Update committed text synchronously; consecutive WebSocket finals must see the latest prefix.
    if (delta) this.liveParts.push(delta)
    // A soft last word can be in the preview and missing from the final; keep it in case nothing follows.
    this.heardTail = droppedTail(this.lastHeard, joinUtterances(this.liveParts))
    this.lastHeard = ''
    if (delta) {
      const chunk = this.settles() ? this.settle(false) : ''
      this.updateText()
      if (chunk) void this.enqueue(gen, () => this.typeLive(chunk))
      void this.watchVoice(gen)
    }
  }

  private async acceptFinal(text: string, gen: number): Promise<void> {
    if (!text.trim() || !this.valid(gen)) return
    this.liveParts.push(text)
    // Batch engines already run inside the ordered queue: save first, then type in place.
    const chunk = this.settles() ? this.settle(false) : ''
    this.updateText()
    await this.typeLive(chunk)
    void this.watchVoice(gen)
  }

  private vocabulary(): VocabularyEntry[] {
    return this.settings?.vocabulary ?? []
  }

  /** Personal words learned during a session apply to everything not yet typed. */
  updateVocabulary(entries: VocabularyEntry[]): void {
    if (!this.settings) return
    this.settings.vocabulary = entries
    if (this.busy) this.updateText()
  }

  private liveTyping(): boolean {
    return !this.practiceText && this.settings?.insertMode === 'live'
  }

  /** Whether a session's text is built from settled words (every mode except practice takes). */
  private settles(): boolean {
    return !this.practiceText
  }

  private rawWords(raw = joinUtterances(this.liveParts)): string[] {
    return normalizeTranscript(raw).split(' ').filter(Boolean)
  }

  /**
   * Settle the next run of words for live typing and return it (or '' if nothing is ready).
   * Trailing words that could still turn into a learned phrase wait for the next phrase (or the end
   * of the session), so "as two" is never typed before "teasy". The caller saves, then types.
   */
  private settle(final: boolean): string {
    const pending = this.rawWords().slice(this.typedRawWords)
    if (!pending.length) return ''
    const hold = final ? 0 : heldTailWords(pending.join(' '), this.vocabulary())
    const take = pending.length - hold
    if (take <= 0) return ''
    const applied = applyVocabularyDetailed(pending.slice(0, take).join(' '), this.vocabulary())
    const hits = applied.hits
    // Voice commands first ("new paragraph" becomes a marker), then speech tidy, piece by piece:
    // what is typed can't easily be taken back; the end of the take tidies the whole text once more.
    const said = this.settings ? applyCommands(applied.text, this.settings.structure).text : applied.text
    const tidy = this.autoTidy()
    const text = tidy ? tidyNext(this.typedText, said, tidy, this.tidyNames()).text : said
    this.liveCues?.phrase(this.typedText.split(/\s+/).filter(Boolean).length, this.journalMs())
    this.typedRawWords += take
    this.typedText = joinUtterances([this.typedText, text])
    this.hits.push(...hits)
    return text
  }

  private rescueTail(): void {
    if (!this.item) return
    const unconfirmed = normalizeTranscript(this.item.unconfirmedText ?? '')
    const tail = unconfirmed && unconfirmed.split(' ').length <= 4 ? unconfirmed : this.heardTail
    this.heardTail = ''
    if (!tail) return
    this.item.unconfirmedText = undefined
    this.liveParts.push(tail)
    this.updateText()
  }

  /** Words that keep their capital when tidy lowers one after a pause. */
  private tidyNames(): string[] {
    return this.vocabulary()
      .filter((entry) => entry.enabled)
      .flatMap((entry) => entry.meant.split(/\s+/))
  }

  /**
   * What tidies every take by itself: everything switched on when "Tidy every take" is on; otherwise
   * only writing a mixed-in language in its own script, if that was asked for.
   */
  private autoTidy(): TidySettings | null {
    const tidy = this.settings?.tidy
    if (!tidy) return null
    if (tidy.auto) return tidy
    return tidyAlways(tidy) ? scriptOnly(tidy) : null
  }

  /** Tidy the whole take's text (and the app's copy when live typing still can). */
  private async applyTidy(
    gen: number,
    asked: boolean,
    settings: TidySettings | null = this.settings?.tidy ?? null
  ): Promise<'typed' | 'saved' | 'kept-in-history' | 'unchanged'> {
    if (!this.settings || !this.item || !settings) return 'unchanged'
    const commanded = applyCommands(this.typedText, this.settings.structure)
    const tidied = tidySpeech(commanded.text, settings, this.tidyNames())
    const text = tidied.text
    if (text === this.typedText) {
      if (asked) this.notice('Nothing to tidy.')
      return 'unchanged'
    }
    this.typedText = text
    this.updateText()
    const done = `Tidied: ${[
      describeTidy(tidied.changes),
      commanded.count ? `${commanded.count} structure ${commanded.count === 1 ? 'command' : 'commands'}` : ''
    ]
      .filter(Boolean)
      .join(', ')}.`
    if (!this.liveTyping()) {
      if (asked) this.notice(done)
      return 'saved'
    }
    let result: 'typed' | 'kept-in-history' = 'typed'
    await this.enqueue(gen, async () => {
      result = await this.replaceTyped()
    })
    if ((result as string) === 'typed') this.notice(done)
    return result
  }

  /** The HUD's Tidy button: tidy everything said so far, in the HUD and in the app. */
  async tidyNow(sessionId: string): Promise<'typed' | 'saved' | 'kept-in-history' | 'unchanged'> {
    if (!this.busy || !this.item || this.item.id !== sessionId || this.practiceText || this.failed)
      throw new Error('This session is no longer open for edits.')
    const gen = this.generation
    const chunk = this.settle(true)
    this.updateText()
    if (chunk) await this.enqueue(gen, () => this.typeLive(chunk))
    return this.applyTidy(gen, true)
  }

  private async typeLive(text: string): Promise<void> {
    if (!text || this.reviewRequested || !this.liveTyping()) return
    // Structure markers become line breaks only here, on the way into the app.
    const piece = withTrailingSpace(text)
    const out = renderNext(this.targetText, piece)
    // pasteBlock adds the space after the words itself.
    if (out) await this.dependencies.injector.pasteBlock(out.replace(/ $/, ''), this.pasteAbort.signal)
    this.targetText += piece
    this.lastTypedAt = Date.now()
  }

  /** Bring the target app's typed text in line with the settled text, if that is still safe. */
  private async replaceTyped(): Promise<'typed' | 'kept-in-history'> {
    const desiredText = withTrailingSpace(this.typedText)
    // Compared as typed into the app, with structure markers as the line breaks they became.
    const desired = renderStructure(desiredText)
    const old = renderStructure(this.targetText)
    let same = 0
    while (same < old.length && same < desired.length && old[same] === desired[same]) same++
    if (same === old.length && same === desired.length) return 'typed'
    const erase = old.length - same
    const replace = this.dependencies.injector.replaceTail
    if (
      !replace ||
      erase > 400 ||
      !this.lastTypedAt ||
      !this.host.targetUntouchedSince?.(this.lastTypedAt)
    ) {
      this.notice('Fixed here and in History. The app’s text changed since, so it was left alone.')
      return 'kept-in-history'
    }
    await replace.call(this.dependencies.injector, erase, desired.slice(same), this.pasteAbort.signal)
    this.targetText = desiredText
    this.lastTypedAt = Date.now()
    return 'typed'
  }

  /** Nothing this session reached speech level: the microphone in use is silent or turned down. */
  private micSilent(): boolean {
    return !!this.settings && this.peakLevel < vadFromSensitivity(this.settings.vadSensitivity).speechThreshold
  }

  private notice(message: string): void {
    this.setState({ ...this.state, notice: message, noticeAt: Date.now() })
  }

  /** What the HUD shows: the typed text as typed, then everything after it with personal words applied. */
  private displayText(raw = joinUtterances(this.liveParts)): string {
    if (!this.settles()) return applyVocabulary(raw, this.vocabulary())
    const rest = this.rawWords(raw).slice(this.typedRawWords).join(' ')
    return joinUtterances([this.typedText, applyVocabulary(rest, this.vocabulary())])
  }

  private updateText(): void {
    if (!this.item || !this.settings) return
    this.item.rawText = joinUtterances(this.liveParts)
    this.item.text = this.displayText(this.item.rawText)
    this.checkpoint()
    this.setState({
      ...this.state,
      partial: this.item.text,
      typedLength: this.liveTyping() ? this.typedText.length : 0,
      message: this.recording ? 'Listening' : 'Finishing'
    })
  }

  private enqueue(gen: number, action: () => Promise<void>): Promise<void> {
    this.workChain = this.workChain
      .then(async () => {
        if (this.valid(gen)) await action()
      })
      .catch((error: unknown) => {
        if (
          this.reviewRequested &&
          this.pasteAbort.signal.aborted &&
          error instanceof Error &&
          error.name === 'AbortError'
        )
          return
        this.fail(errorMessage(error), gen)
      })
    return this.workChain
  }

  private checkpoint(): void {
    if (!this.item) return
    if (this.recording)
      this.item.durationMs = Math.max(this.item.durationMs, Date.now() - this.startedAt)
    this.item.hasAudio = this.host.journal.hasAudio(this.item.id)
    // History keeps the text as it goes into the app: structure markers become line breaks.
    const saved = { ...this.item, text: renderStructure(this.item.text) }
    this.host.journal.save(saved)
    this.host.onHistoryItem(saved)
  }

  private command(action: RecordingCommand['action']): void {
    this.host.sendOverlayCommand({
      ...recordingCommand(action, this.settings ?? this.host.getSettings()),
      sessionId: this.generation
    })
  }

  private fail(message: string, gen: number): void {
    if (gen !== this.generation || this.failed) return
    this.clearFinishTimer()
    this.paused = false
    this.pausing = false
    this.recordStreamUsage('error')
    this.pasteAbort.abort()
    this.failed = true
    this.requestAbort?.abort()
    this.clearWatchdog()
    this.recording = false
    this.busy = false
    this.stream?.close()
    this.stream = null
    this.command('cancel')
    if (this.item) {
      if (this.practiceText) this.item.text = this.practiceText
      this.item.status = 'error'
      this.item.error = message
      try {
        this.checkpoint()
      } catch {
        message += ' Could not save to disk; copy any visible text now.'
      }
    }
    this.showError(message)
  }

  private showError(message: string): void {
    this.setState({ ...this.state, status: 'error', message, rms: 0, bars: [] })
    this.host.placeOverlay()
    if (!this.reviewRequested && this.host.getSettings().showOverlay)
      this.host.overlay.showInactive()
    // The durable History entry owns recovery; the HUD must never trap the user.
    this.scheduleHide(8000)
  }

  private setState(state: OverlayState): void {
    this.state = {
      ...state,
      mode: this.practiceText ? 'practice' : 'dictation',
      ...(state.status !== 'hidden' && this.item
        ? {
            sessionId: this.item.id,
            cueAnalysis: this.item.cueAnalysis,
            cueError: this.item.cueError
          }
        : {})
    }
    this.host.onOverlay(this.state)
  }
  private scheduleHide(delay = 1400): void {
    this.clearHide()
    // The HUD plays its exit while the state says 'leaving'; the window hides once that is done.
    this.hideTimer = setTimeout(() => {
      this.setState({ ...this.state, status: 'leaving' })
      this.hideTimer = setTimeout(() => {
        this.setState(emptyOverlay())
        if (!this.host.overlay.isDestroyed()) this.host.overlay.hide()
      }, LEAVE_MS)
    }, delay)
  }
  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }
  private clearHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Dictation failed. Saved text is available in History.'
}
