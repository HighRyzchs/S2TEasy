import { SAMPLE_RATE } from '@shared/constants'
import { StreamingResampler, rms } from '@shared/audio'
import { PcmFramer } from '@shared/pcm'
import { EnergyVad, vadFromSensitivity } from '@shared/vad'
import { bandsFromPcm } from '@shared/waveform'
import { encodeWav, bytesToBase64 } from '@shared/wav'
import type { AudioLevelPayload, CaptureConfig } from '@shared/types'

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'finish') { this.active = false; this.port.postMessage({ type: 'flushed' }); }
    };
  }
  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]
    if (this.active && channel && channel.length) {
      this.port.postMessage(new Float32Array(channel))
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

export function audioConstraints(
  config: Pick<
    CaptureConfig,
    'microphoneId' | 'echoCancellation' | 'noiseSuppression' | 'autoGainControl' | 'voiceIsolation'
  >
): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: config.echoCancellation,
    noiseSuppression: config.noiseSuppression,
    autoGainControl: config.autoGainControl
  }
  if (config.microphoneId) audio.deviceId = { exact: config.microphoneId }
  if (config.voiceIsolation) Object.assign(audio, { voiceIsolation: true })
  return audio
}

export class MicSession {
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private worklet: AudioWorkletNode | null = null
  private processor: ScriptProcessorNode | null = null
  private mute: GainNode | null = null
  private stream: MediaStream | null = null
  private vad = new EnergyVad({ sampleRate: SAMPLE_RATE })
  private framer = new PcmFramer()
  private resampler: StreamingResampler | null = null
  private consume: ((frame: Float32Array) => void) | null = null
  private tailWait: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null
  private flushWait: {
    timer: ReturnType<typeof setTimeout>
    resolve: (flushed: boolean) => void
  } | null = null
  private capturedSamples = 0
  private generation = 0
  private running = false
  private lastLevelAt = 0
  private config: CaptureConfig | null = null
  private onLevel: (level: AudioLevelPayload) => void
  private onUtterance: (wavBase64: string, durationMs: number, startMs?: number) => void
  private onPcm: (bytes: Uint8Array) => void

  constructor(handlers: {
    onLevel: (level: AudioLevelPayload) => void
    onUtterance: (wavBase64: string, durationMs: number, startMs?: number) => void
    onPcm?: (bytes: Uint8Array) => void
  }) {
    this.onLevel = handlers.onLevel
    this.onUtterance = handlers.onUtterance
    this.onPcm = handlers.onPcm ?? (() => undefined)
  }

  async start(config: CaptureConfig): Promise<void> {
    await this.stop()
    const generation = this.generation
    this.config = config
    this.vad = new EnergyVad({
      sampleRate: SAMPLE_RATE,
      ...vadFromSensitivity(config.vadSensitivity)
    })
    this.framer.reset()
    this.running = true
    this.lastLevelAt = 0
    this.capturedSamples = 0

    const stream = await openMic(config)
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    this.stream = stream
    this.context = new AudioContext()
    await this.context.resume()
    if (generation !== this.generation) return
    if (this.context.state !== 'running')
      throw new Error('Microphone audio could not start. Check your audio device and try again.')
    this.resampler = new StreamingResampler(this.context.sampleRate, SAMPLE_RATE)
    this.source = this.context.createMediaStreamSource(this.stream)
    this.gain = this.context.createGain()
    this.gain.gain.value = config.inputGain
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 256
    this.mute = this.context.createGain()
    this.mute.gain.value = 0
    this.source.connect(this.gain)
    this.gain.connect(this.analyser)

    const consume = (resampled: Float32Array) => {
      if (!this.running || !this.context || !this.config || !resampled.length) return
      this.capturedSamples += resampled.length
      const now = performance.now()
      if (now - this.lastLevelAt >= 32) {
        this.lastLevelAt = now
        this.onLevel({ rms: rms(resampled), bars: bandsFromPcm(resampled) })
      }
      // Every engine checkpoints PCM for recovery; network streaming is selected in main.
      for (const frame of this.framer.push(resampled)) this.onPcm(frame)
      if (this.config.engine === 'router-audio') return
      for (const item of this.vad.push(resampled)) {
        if (item.type === 'utterance') {
          this.onUtterance(
            frameToWav(item.pcm),
            (item.pcm.length / SAMPLE_RATE) * 1000,
            Math.max(0, ((this.capturedSamples - item.pcm.length) / SAMPLE_RATE) * 1000)
          )
        }
      }
    }

    this.consume = consume
    const onPcm = (input: Float32Array) => {
      if (this.running && this.resampler) consume(this.resampler.push(input))
    }

    try {
      const blob = new Blob([WORKLET], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      try {
        await this.context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      if (generation !== this.generation) return
      this.worklet = new AudioWorkletNode(this.context, 'pcm-capture')
      this.worklet.port.onmessage = (event: MessageEvent<Float32Array | { type: string }>) => {
        if (event.data instanceof Float32Array) onPcm(event.data)
        else if (event.data?.type === 'flushed') this.flushWait?.resolve(true)
      }
      this.gain.connect(this.worklet)
      this.worklet.connect(this.mute)
    } catch {
      if (generation !== this.generation) return
      this.processor = this.context.createScriptProcessor(4096, 1, 1)
      this.processor.onaudioprocess = (event) => {
        onPcm(event.inputBuffer.getChannelData(0))
      }
      this.gain.connect(this.processor)
      this.processor.connect(this.mute)
    }
    this.mute.connect(this.context.destination)
  }

  async finish(): Promise<{
    leftoverBase64: string
    fullBase64: string
    durationMs: number
    leftoverStartMs: number
  }> {
    const generation = this.generation
    this.vad.beginFinish()
    const delay = this.config?.captureTailMs ?? 600
    if (delay)
      await new Promise<void>((resolve) => {
        const done = () => {
          if (this.tailWait) clearTimeout(this.tailWait.timer)
          this.tailWait = null
          resolve()
        }
        this.tailWait = { timer: setTimeout(done, delay), resolve: done }
      })
    if (generation !== this.generation) throw new DOMException('Recording cancelled', 'AbortError')
    if (this.worklet) {
      const flushed = await new Promise<boolean>((resolve) => {
        const done = (ok: boolean) => {
          if (this.flushWait) clearTimeout(this.flushWait.timer)
          this.flushWait = null
          resolve(ok)
        }
        this.flushWait = { timer: setTimeout(() => done(false), 1500), resolve: done }
        this.worklet!.port.postMessage({ type: 'finish' })
      })
      if (generation !== this.generation)
        throw new DOMException('Recording cancelled', 'AbortError')
      if (!flushed)
        throw new Error(
          'The microphone did not flush its final buffer. Saved audio is available in History.'
        )
    }
    this.source?.disconnect()
    if (this.resampler) this.consume?.(this.resampler.flush())
    this.running = false
    const leftoverPcm = this.config?.engine !== 'router-audio' ? this.vad.finish() : null
    // Quiet right-context helps speech decoders finalize a last phoneme; it is never sent alone.
    const padded = leftoverPcm ? new Float32Array(leftoverPcm.length + SAMPLE_RATE * 0.2) : null
    if (padded && leftoverPcm) padded.set(leftoverPcm)
    const leftoverBase64 = padded ? frameToWav(padded) : ''
    const flushed = this.framer.flush()
    if (flushed) this.onPcm(flushed)
    const durationMs = (this.capturedSamples / SAMPLE_RATE) * 1000
    await this.stop()
    return {
      leftoverBase64,
      fullBase64: '',
      durationMs,
      leftoverStartMs: Math.max(0, durationMs - ((leftoverPcm?.length ?? 0) / SAMPLE_RATE) * 1000)
    }
  }

  async stop(): Promise<void> {
    ++this.generation
    this.tailWait?.resolve()
    this.flushWait?.resolve(false)
    this.running = false
    this.config = null
    this.resampler = null
    this.consume = null
    this.worklet?.port.close()
    this.worklet?.disconnect()
    this.processor?.disconnect()
    this.mute?.disconnect()
    this.gain?.disconnect()
    this.analyser?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.worklet = null
    this.processor = null
    this.mute = null
    this.gain = null
    this.analyser = null
    this.source = null
    this.stream = null
    this.context = null
  }
}

export class MicPreview {
  private session: {
    stream: MediaStream
    context: AudioContext
    source: MediaStreamAudioSourceNode
    gain: GainNode
    processor: ScriptProcessorNode
    mute: GainNode
  } | null = null
  private timer = 0

  async start(
    config: Pick<
      CaptureConfig,
      | 'microphoneId'
      | 'echoCancellation'
      | 'noiseSuppression'
      | 'autoGainControl'
      | 'voiceIsolation'
      | 'inputGain'
    >,
    onLevel: (rms: number) => void
  ): Promise<void> {
    await this.stop()
    const stream = await openMic(config)
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const gain = context.createGain()
    gain.gain.value = config.inputGain
    const processor = context.createScriptProcessor(2048, 1, 1)
    const mute = context.createGain()
    mute.gain.value = 0
    processor.onaudioprocess = (event) => {
      onLevel(rms(event.inputBuffer.getChannelData(0)))
    }
    source.connect(gain)
    gain.connect(processor)
    processor.connect(mute)
    mute.connect(context.destination)
    this.session = { stream, context, source, gain, processor, mute }
  }

  async stop(): Promise<void> {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = 0
    const session = this.session
    this.session = null
    if (!session) return
    session.processor.disconnect()
    session.mute.disconnect()
    session.gain.disconnect()
    session.source.disconnect()
    session.stream.getTracks().forEach((track) => track.stop())
    if (session.context.state !== 'closed') await session.context.close()
  }
}

async function openMic(
  config: Pick<
    CaptureConfig,
    'microphoneId' | 'echoCancellation' | 'noiseSuppression' | 'autoGainControl' | 'voiceIsolation'
  >
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(config) })
  } catch (error) {
    if (
      !(error instanceof DOMException) ||
      !['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)
    )
      throw error
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: config.microphoneId ? { exact: config.microphoneId } : undefined,
        channelCount: 1,
        echoCancellation: config.echoCancellation,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
  }
}

function frameToWav(pcm: Float32Array): string {
  return bytesToBase64(encodeWav(pcm, SAMPLE_RATE))
}
