import { rms } from './audio'
import type { VadSensitivity } from './types'

export type VadEvent = { type: 'level'; rms: number } | { type: 'utterance'; pcm: Float32Array }

export type VadOptions = {
  sampleRate: number
  /** RMS above this is treated as speech. */
  speechThreshold: number
  silenceMs: number
  minSpeechMs: number
  maxUtteranceMs: number
}

const DEFAULTS: VadOptions = {
  sampleRate: 16_000,
  speechThreshold: 0.01,
  silenceMs: 550,
  minSpeechMs: 180,
  maxUtteranceMs: 15_000
}

export function vadFromSensitivity(
  sensitivity: VadSensitivity
): Pick<VadOptions, 'speechThreshold' | 'silenceMs' | 'minSpeechMs' | 'maxUtteranceMs'> {
  if (sensitivity === 'low') {
    return { speechThreshold: 0.022, silenceMs: 720, minSpeechMs: 220, maxUtteranceMs: 15_000 }
  }
  if (sensitivity === 'high') {
    return { speechThreshold: 0.006, silenceMs: 420, minSpeechMs: 140, maxUtteranceMs: 15_000 }
  }
  return { speechThreshold: 0.01, silenceMs: 550, minSpeechMs: 180, maxUtteranceMs: 15_000 }
}

/**
 * Energy VAD that cuts utterances at pauses so live dictation can
 * transcribe and insert incrementally, the way a flow-style app should.
 */
export class EnergyVad {
  private readonly options: VadOptions
  private speaking = false
  private speech: Float32Array[] = []
  private speechSamples = 0
  private voicedSamples = 0
  private silenceSamples = 0
  private readonly silenceLimit: number
  private readonly minSpeech: number
  private readonly maxSpeech: number

  constructor(options: Partial<VadOptions> = {}) {
    this.options = { ...DEFAULTS, ...options }
    const sr = this.options.sampleRate
    this.silenceLimit = Math.round((this.options.silenceMs / 1000) * sr)
    this.minSpeech = Math.round((this.options.minSpeechMs / 1000) * sr)
    this.maxSpeech = Math.round((this.options.maxUtteranceMs / 1000) * sr)
  }

  reset(): void {
    this.speaking = false
    this.speech = []
    this.speechSamples = 0
    this.voicedSamples = 0
    this.silenceSamples = 0
  }

  push(frame: Float32Array): VadEvent[] {
    const events: VadEvent[] = []
    const level = rms(frame)
    events.push({ type: 'level', rms: level })

    const isSpeech = level >= this.options.speechThreshold
    if (isSpeech) {
      if (!this.speaking) {
        this.speaking = true
        this.speech = []
        this.speechSamples = 0
      }
      this.speech.push(new Float32Array(frame))
      this.speechSamples += frame.length
      this.voicedSamples += frame.length
      this.silenceSamples = 0
      if (this.speechSamples >= this.maxSpeech) {
        const utterance = this.flushSpeech()
        if (utterance) events.push({ type: 'utterance', pcm: utterance })
      }
      return events
    }

    if (!this.speaking) return events

    this.speech.push(new Float32Array(frame))
    this.speechSamples += frame.length
    this.silenceSamples += frame.length
    if (this.silenceSamples >= this.silenceLimit) {
      const utterance = this.flushSpeech()
      if (utterance) events.push({ type: 'utterance', pcm: utterance })
    }
    return events
  }

  /** Remaining audio when the user stops — may be short trailing speech. */
  finish(): Float32Array | null {
    return this.flushSpeech()
  }

  private flushSpeech(): Float32Array | null {
    const parts = this.speech
    const samples = this.speechSamples
    const voiced = this.voicedSamples
    this.reset()
    if (voiced < this.minSpeech) return null
    const out = new Float32Array(samples)
    let offset = 0
    for (const part of parts) {
      out.set(part, offset)
      offset += part.length
    }
    return out
  }
}
