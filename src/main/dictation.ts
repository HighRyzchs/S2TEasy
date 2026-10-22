import { randomUUID } from 'node:crypto'
import { startError } from '../shared/engine'
import { joinUtterances, streamingAdvance, streamingPartial } from '../shared/transcript'
import { applyVocabulary } from '../shared/vocabulary'
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
  private workChain: Promise<void> = Promise.resolve()
  private state: OverlayState = emptyOverlay()
  private hideTimer: NodeJS.Timeout | null = null
  private stream: RouterAudioClient | null = null
  private item: HistoryItem | null = null
  private settings: AppSettings | null = null
  private failed = false
  private captureStarted = false
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
    const gen = ++this.generation
    this.busy = true
    this.recording = true
    this.failed = false
    this.captureStarted = false
    this.settings = settings
    this.startedAt = Date.now()
    this.liveParts = []
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
            language: settings.language
          },
          {
            onTranscript: (event) => {
              try {
                this.onStreamTranscript(event.text, event.isPartial, gen)
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
      this.command('start')
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
    this.setState({ ...this.state, status: 'transcribing', message: 'Finishing' })
    this.command('stop')
  }

  cancel(): void {
    ++this.generation
    this.recording = false
    this.busy = false
    this.failed = true
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
        this.showError(
          'Could not save cancelled session to disk. Copy visible text before quitting.'
        )
        return
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
      if (this.settings?.recoveryAudio || this.settings?.keepAudioForTraining)
        this.host.journal.append(this.item.id, bytes)
      this.stream?.sendPcm(bytes)
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  onUtterance(wavBase64: string, gen: number): Promise<void> {
    if (gen !== this.generation || this.settings?.sttEngine === 'router-audio')
      return Promise.resolve()
    // One ordered queue for network responses and insertion. A rejected paste never poisons future sessions.
    return this.enqueue(gen, async () => {
      const text = await this.transcribe(wavBase64)
      if (!this.valid(gen)) return
      await this.acceptFinal(text, gen)
    })
  }

  async onFinished(
    leftoverBase64: string,
    _fullBase64: string,
    durationMs: number,
    gen: number
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
        await this.onUtterance(leftoverBase64, gen)
      await this.workChain
      if (!this.valid(gen) || !this.item || !this.settings) return
      if (!this.item.text.trim()) {
        this.fail('No finalized speech received. Recover retained audio from History.', gen)
        return
      }
      // Persist before attempting any final insertion; focus/clipboard failures cannot erase text.
      this.checkpoint()
      if (!this.practiceText && this.settings.insertMode === 'final')
        await this.dependencies.injector.paste(this.item.text)
      if (this.practiceText) this.item.text = this.practiceText
      if (!this.valid(gen)) return
      this.item.status = 'complete'
      this.item.error = undefined
      if (!this.settings.keepAudioForTraining) this.host.journal.removeAudio(this.item.id)
      this.checkpoint()
      this.busy = false
      this.setState({
        ...this.state,
        status: 'success',
        partial: this.item.text,
        message: this.practiceText ? 'Practice take saved' : 'Saved & inserted',
        elapsedMs: durationMs,
        rms: 0,
        bars: []
      })
      this.scheduleHide()
    } catch (error) {
      this.fail(errorMessage(error), gen)
    }
  }

  async insertNow(text: string): Promise<void> {
    if (this.busy) throw new Error('Finish the current dictation before inserting from History.')
    this.busy = true
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
      await this.dependencies.injector.paste(text)
      if (gen !== this.generation) return
      this.setState({ ...emptyOverlay(), status: 'success', partial: text, message: 'Inserted' })
      this.scheduleHide()
    } finally {
      if (gen === this.generation) this.busy = false
    }
  }

  private valid(gen: number): boolean {
    return gen === this.generation && this.busy && !this.failed
  }

  private transcribe(wavBase64: string): Promise<string> {
    const settings = this.settings!
    return this.dependencies.transcribe({
      apiKey: settings.apiKey,
      model: settings.sttEngine === 'local' ? settings.localModel : settings.model,
      language: settings.language,
      wavBase64,
      engine: settings.sttEngine === 'local' ? 'local' : 'openrouter',
      localEndpoint: settings.localEndpoint,
      vocabulary: settings.vocabulary.filter((row) => row.enabled).map((row) => row.meant)
    })
  }

  private onStreamTranscript(text: string, partial: boolean, gen: number): void {
    if (!this.valid(gen)) return
    const committed = joinUtterances(this.liveParts)
    if (partial) {
      this.setState({
        ...this.state,
        partial: applyVocabulary(streamingPartial(committed, text), this.settings!.vocabulary)
      })
      return
    }
    const { delta } = streamingAdvance(committed, text)
    // Update committed text synchronously; consecutive WebSocket finals must see the latest prefix.
    if (delta) {
      this.liveParts.push(delta)
      this.updateText()
      void this.enqueue(gen, async () => {
        if (this.settings?.insertMode === 'live')
          await this.dependencies.injector.pasteBlock(
            applyVocabulary(delta, this.settings.vocabulary)
          )
      })
    }
  }

  private async acceptFinal(text: string, gen: number): Promise<void> {
    if (!text.trim() || !this.valid(gen)) return
    this.liveParts.push(text)
    this.updateText()
    if (this.settings?.insertMode === 'live')
      await this.dependencies.injector.pasteBlock(applyVocabulary(text, this.settings.vocabulary))
  }

  private updateText(): void {
    if (!this.item || !this.settings) return
    this.item.rawText = joinUtterances(this.liveParts)
    this.item.text = joinUtterances(
      this.liveParts.map((part) => applyVocabulary(part, this.settings!.vocabulary))
    )
    this.checkpoint()
    this.setState({
      ...this.state,
      partial: this.item.text,
      message: this.recording ? 'Listening' : 'Finishing'
    })
  }

  private enqueue(gen: number, action: () => Promise<void>): Promise<void> {
    this.workChain = this.workChain
      .then(async () => {
        if (this.valid(gen)) await action()
      })
      .catch((error: unknown) => this.fail(errorMessage(error), gen))
    return this.workChain
  }

  private checkpoint(): void {
    if (!this.item) return
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
    this.failed = true
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
    this.host.overlay.showInactive()
    // Errors remain visible until the next action. No timer silently hides a failure.
    this.clearHide()
  }

  private setState(state: OverlayState): void {
    this.state = { ...state, mode: this.practiceText ? 'practice' : 'dictation' }
    this.host.onOverlay(this.state)
  }
  private scheduleHide(): void {
    this.clearHide()
    this.hideTimer = setTimeout(() => {
      this.setState(emptyOverlay())
      if (!this.host.overlay.isDestroyed()) this.host.overlay.hide()
    }, 1400)
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
