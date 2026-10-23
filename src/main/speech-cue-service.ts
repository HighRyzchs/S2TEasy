import { randomUUID } from 'node:crypto'
import type { AppSettings, HistoryItem } from '../shared/types'
import { cueFeedback, type CueFeedback, type CueRequest } from '../shared/speech-cues'
import type { UsageMeasurement } from '../shared/usage'
import { observeAudio } from './audio-observations'
import { pcmToWav } from './session-journal'
import { analyzeCueAudio } from './speech-cue-model'

type CueHost = {
  settings: () => AppSettings
  history: () => HistoryItem[]
  read: (id: string, range: CueRequest) => Uint8Array
  save: (item: HistoryItem) => void
  busy: () => boolean
  usage: (id: string, row: UsageMeasurement) => void
}
export class SpeechCueService {
  private pending?: { id: string; controller: AbortController }
  constructor(
    private host: CueHost,
    private analyze = analyzeCueAudio
  ) {}
  cancel(id?: string): void {
    if (this.pending && (!id || id === this.pending.id)) this.pending.controller.abort()
  }
  isBusy(): boolean {
    return !!this.pending
  }
  async run(id: string, range: CueRequest): Promise<HistoryItem[]> {
    if (this.pending || this.host.busy())
      throw new Error('Finish the current recording, recovery or cue analysis first.')
    const settings = this.host.settings()
    if (!settings.speechCues.enabled)
      throw new Error('Enable Speech cues in Settings → Voice intelligence first.')
    if (!settings.apiKey.trim())
      throw new Error(
        'Save an OpenRouter key in Voice intelligence first. Your streaming key is separate.'
      )
    const prefs = settings.speechCues
    if (
      (!prefs.emotions || !prefs.emotionLabels.length) &&
      !prefs.delivery &&
      !prefs.pacing &&
      !prefs.events
    )
      throw new Error('Select at least one cue category.')
    const item = this.host.history().find((row) => row.id === id)
    if (!item || !item.hasAudio || ['recording', 'processing'].includes(item.status ?? ''))
      throw new Error('A finished take with retained audio is required.')
    if (
      !range ||
      !Number.isFinite(range.startMs) ||
      !Number.isFinite(range.endMs) ||
      range.startMs < 0 ||
      range.endMs <= range.startMs ||
      range.endMs - range.startMs > 30000
    )
      throw new Error('Choose an audio excerpt of up to 30 seconds.')
    const pcm = this.host.read(id, range)
    const observations = observeAudio(pcm)
    if (observations.durationMs < 500 || observations.rms < 0.002)
      throw new Error(
        'This excerpt is too short or nearly silent. Choose at least half a second of audible speech.'
      )
    const controller = new AbortController()
    this.pending = { id, controller }
    try {
      const result = await this.analyze({
        apiKey: settings.apiKey,
        settings: prefs,
        wavBase64: pcmToWav(pcm).toString('base64'),
        durationMs: observations.durationMs,
        startMs: range.startMs,
        signal: controller.signal,
        onUsage: (row) => this.host.usage(id, row)
      })
      controller.signal.throwIfAborted()
      const current = this.host.history().find((row) => row.id === id)
      if (
        !current ||
        !current.hasAudio ||
        current.text !== item.text ||
        this.host.busy() ||
        !this.host.settings().speechCues.enabled
      )
        throw new Error('This take or settings changed during analysis. The result was not saved.')
      this.host.save({
        ...current,
        cueAnalysis: {
          ...result,
          schemaVersion: 1,
          id: randomUUID(),
          model: prefs.model,
          createdAt: Date.now(),
          startMs: range.startMs,
          endMs: range.startMs + observations.durationMs,
          observations
        }
      })
      return this.host.history()
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('Cue analysis cancelled. Already sent requests may still be billed.')
      throw error
    } finally {
      this.pending = undefined
    }
  }
  feedback(id: string, analysisId: string, patch: CueFeedback): HistoryItem[] {
    if (this.host.busy() || this.pending)
      throw new Error('Finish recording or cue analysis before editing cues.')
    const item = this.host.history().find((row) => row.id === id)
    if (!item?.cueAnalysis || item.cueAnalysis.id !== analysisId)
      throw new Error('This analysis changed. Reopen Review and try again.')
    this.host.save({ ...item, cueAnalysis: cueFeedback(item.cueAnalysis, patch) })
    return this.host.history()
  }
  clear(id: string): HistoryItem[] {
    if (this.host.busy() || this.pending) throw new Error('Finish recording or cue analysis first.')
    const item = this.host.history().find((row) => row.id === id)
    if (!item) throw new Error('This take is no longer available.')
    const { cueAnalysis: _removed, ...next } = item
    this.host.save(next)
    return this.host.history()
  }
}
