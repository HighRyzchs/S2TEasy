import { bandsFromPcm } from '@shared/waveform'
import type { AudioLevelPayload } from '@shared/types'

/** Local-only level meter. No audio is recorded, stored, or sent to a service. */
export class VolumeMeter {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private frame = 0
  private generation = 0

  async start(onLevel: (level: AudioLevelPayload) => void): Promise<void> {
    this.stop()
    const generation = this.generation
    const context = new AudioContext()
    this.context = context
    try {
      await context.resume()
      if (generation !== this.generation) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      // Keep the graph rendering without playing the user's microphone back.
      const mute = context.createGain()
      mute.gain.value = 0
      analyser.connect(mute)
      mute.connect(context.destination)
      const pcm = new Float32Array(analyser.fftSize)
      const tick = () => {
        if (generation !== this.generation) return
        analyser.getFloatTimeDomainData(pcm)
        const rms = Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length)
        onLevel({ rms, bars: bandsFromPcm(pcm) })
        this.frame = requestAnimationFrame(tick)
      }
      tick()
    } catch (error) {
      if (generation === this.generation) this.stop()
      throw error
    }
  }

  stop(): void {
    ++this.generation
    cancelAnimationFrame(this.frame)
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => undefined)
    this.context = null
  }
}
