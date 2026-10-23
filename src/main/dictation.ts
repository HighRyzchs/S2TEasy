import type { CueAnalysis } from '../shared/speech-cues'
import type { WordTiming } from '../shared/word-timing'
import type { UsageRecord } from '../shared/usage'
import { randomUUID } from 'node:crypto'
import { startError } from '../shared/engine'
import {
  joinUtterances,
  normalizeTranscript,
  streamingAdvance,
  streamingPartial
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
  analyzeCompleted?: (
    item: HistoryItem,
    settings: AppSettings,
    signal: AbortSignal
  ) => Promise<CueAnalysis | undefined>
}

type Dependencies = {
  injector: Pick<TextInjector, 'captureTarget' | 'paste' | 'pasteBlock'>
  transcribe: (input: TranscribeInput) => Promise<string>
  createStream: () => RouterAudioClient
}

export class DictationController {
  private recording = false
  private busy = false
  private generation = 0
  private startedAt = 0
  private liveParts: string[] = []
  // Live typing: what has been typed so far (corrected), and how many raw words that consumed.
  private typedText = ''
  private typedRawWords = 0
  private hits: VocabularyHit[] = []
  private workChain: Promise<void> = Promise.resolve()
  private state: OverlayState = emptyOverlay()
  private hideTimer: NodeJS.Timeout | null = null
  private watchdog: NodeJS.Timeout | null = null
  private pasteAbort = new AbortController()
  private requestAbort: AbortController | null = null
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

  toggle(): void {
    if (this.recording) this.stop()
    else if (this.busy) this.cancel()
    else if (!this.busy) void this.start()
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
      status: 'recording'
    }
    try {
      this.checkpoint()
      this.setState({
        ...emptyOverlay(),
        sessionId: this.item.id,
        status: 'listening',
        message: settings.sttEngine === 'router-audio' ? 'Connecting' : 'Listening'
      })
      this.host.placeOverlay()
      if (settings.showOverlay) this.host.overlay.showInactive()
      if (settings.sttEngine === 'router-audio') {
        const client = this.dependencies.createStream()
        this.stream = client
        await client.connect(
          {
            apiKey: resolveStreamingKey(settings),
            provider: settings.routerProvider,
            language: settings.language,
            keyterms: settings.streamKeyterms ? engineHintTerms(settings.vocabulary, 50) : undefined
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
      this.command('start')
      this.watchdog = setInterval(() => {
        if (this.recording && Date.now() - this.lastLevelAt > 20_000)
          this.fail(
            'No microphone audio received. Check microphone permission and device, then try again. Any saved work is in History.',
            gen
          )
      }, 1000)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  stop(): void {
    if (!this.recording) return
    if (!this.captureStarted) {
      this.cancel()
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
    this.setState({
      ...this.state,
      rms: typeof payload === 'number' ? payload : payload.rms,
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
        (this.settings?.speechCues.enabled && this.settings.speechCues.automatic)
      )
        this.host.journal.append(this.item.id, bytes)
      this.stream?.sendPcm(bytes)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  onUtterance(wavBase64: string, gen: number, startMs = 0): Promise<void> {
    if (gen !== this.generation || this.settings?.sttEngine === 'router-audio')
      return Promise.resolve()
    // One ordered queue for network responses and insertion. A rejected paste never poisons future sessions.
    return this.enqueue(gen, async () => {
      const text = await this.transcribe(wavBase64, gen, startMs)
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
    this.recording = false
    try {
      if (this.item) {
        this.item.durationMs = durationMs
        this.item.status = 'processing'
        this.checkpoint()
      }
      this.setState({ ...this.state, status: 'transcribing', message: 'Finishing' })
      if (this.stream) {
        const stream = this.stream
        await stream.finish()
        if (gen === this.generation) this.stream = null
      }
      if (!this.valid(gen)) return
      if (leftoverBase64 && this.settings?.sttEngine !== 'router-audio')
        await this.onUtterance(leftoverBase64, gen, leftoverStartMs)
      await this.workChain
      if (!this.valid(gen) || !this.item || !this.settings) return
      // Type any words held back as a possible phrase start; no more speech can complete them.
      if (this.liveTyping()) {
        const chunk = this.settleLive(true)
        this.updateText()
        if (chunk) await this.enqueue(gen, () => this.typeLive(chunk))
        if (!this.valid(gen)) return
      }
      if (this.item.unconfirmedText?.trim()) {
        this.fail(
          'The provider did not finalize the last words. Unconfirmed text and retained audio are kept in History for review.',
          gen
        )
        return
      }
      if (!this.item.text.trim()) {
        this.fail('No finalized speech received. Recover retained audio from History.', gen)
        return
      }
      // Words are durable before optional audio interpretation. Its failure must not lose dictation.
      if (
        this.settings.speechCues.enabled &&
        this.settings.speechCues.automatic &&
        this.host.analyzeCompleted
      ) {
        this.setState({
          ...this.state,
          status: 'transcribing',
          message: 'Words saved · listening for delivery',
          rms: 0,
          bars: []
        })
        try {
          const analysis = await this.host.analyzeCompleted(
            this.item,
            this.settings,
            this.requestAbort!.signal
          )
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
          await this.dependencies.injector.paste(this.item.text, this.pasteAbort.signal)
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
      const hits = this.liveTyping()
        ? this.hits
        : applyVocabularyDetailed(this.item.rawText ?? '', this.vocabulary()).hits
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
            : 'Saved & inserted',
        elapsedMs: durationMs,
        rms: 0,
        bars: []
      })
      this.scheduleHide(15000)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
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
    return this.dependencies.transcribe({
      apiKey: settings.apiKey,
      model: settings.sttEngine === 'local' ? settings.localModel : settings.model,
      language: settings.language,
      wavBase64,
      engine: settings.sttEngine === 'local' ? 'local' : 'openrouter',
      localEndpoint: settings.localEndpoint,
      route: settings.openrouterRoute,
      signal: this.requestAbort?.signal,
      requestWordTimings: settings.requestWordTimings,
      onWords: (words) => {
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
      if (words?.length) this.item.words = [...(this.item.words ?? []), ...words].slice(-20_000)
    }
    const { delta } = streamingAdvance(committed, text)
    // Update committed text synchronously; consecutive WebSocket finals must see the latest prefix.
    if (delta) {
      this.liveParts.push(delta)
      const chunk = this.liveTyping() ? this.settleLive(false) : ''
      this.updateText()
      if (chunk) void this.enqueue(gen, () => this.typeLive(chunk))
    }
  }

  private async acceptFinal(text: string, gen: number): Promise<void> {
    if (!text.trim() || !this.valid(gen)) return
    this.liveParts.push(text)
    // Batch engines already run inside the ordered queue: save first, then type in place.
    const chunk = this.liveTyping() ? this.settleLive(false) : ''
    this.updateText()
    await this.typeLive(chunk)
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

  private rawWords(raw = joinUtterances(this.liveParts)): string[] {
    return normalizeTranscript(raw).split(' ').filter(Boolean)
  }

  /**
   * Settle the next run of words for live typing and return it (or '' if nothing is ready).
   * Trailing words that could still turn into a learned phrase wait for the next phrase (or the end
   * of the session), so "as two" is never typed before "teasy". The caller saves, then types.
   */
  private settleLive(final: boolean): string {
    const pending = this.rawWords().slice(this.typedRawWords)
    if (!pending.length) return ''
    const hold = final ? 0 : heldTailWords(pending.join(' '), this.vocabulary())
    const take = pending.length - hold
    if (take <= 0) return ''
    const { text, hits } = applyVocabularyDetailed(pending.slice(0, take).join(' '), this.vocabulary())
    this.typedRawWords += take
    this.typedText = joinUtterances([this.typedText, text])
    this.hits.push(...hits)
    return text
  }

  private typeLive(text: string): Promise<void> {
    if (!text || this.reviewRequested) return Promise.resolve()
    return this.dependencies.injector.pasteBlock(text, this.pasteAbort.signal)
  }

  /** What the HUD shows: the typed text as typed, then everything after it with personal words applied. */
  private displayText(raw = joinUtterances(this.liveParts)): string {
    if (!this.liveTyping()) return applyVocabulary(raw, this.vocabulary())
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
    this.host.journal.save(this.item)
    this.host.onHistoryItem({ ...this.item })
  }

  private command(action: RecordingCommand['action']): void {
    this.host.sendOverlayCommand({
      ...recordingCommand(action, this.settings ?? this.host.getSettings()),
      sessionId: this.generation
    })
  }

  private fail(message: string, gen: number): void {
    if (gen !== this.generation || this.failed) return
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
    this.hideTimer = setTimeout(() => {
      this.setState(emptyOverlay())
      if (!this.host.overlay.isDestroyed()) this.host.overlay.hide()
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
