import { useEffect, useRef, useState } from 'react'
import { emptyOverlay, type AudioLevelPayload, type OverlayState } from '@shared/types'
import { composeOverlayBars, previewTarget } from '@shared/waveform'
import { VolumeMeter } from './lib/volume-meter'

export function useHudPreview(sensitivity = 1) {
  const initial = (): OverlayState => ({
    ...emptyOverlay(),
    status: 'listening',
    message: 'Listening',
    partial: 'A small space for your next big thought.'
  })
  const [state, setState] = useState<OverlayState>(initial)
  const [bars, setBars] = useState<number[]>([])
  const [source, setSource] = useState<'simulated' | 'microphone'>('simulated')
  const current = useRef(initial())
  const started = useRef(performance.now())
  const target = useRef<AudioLevelPayload>({ rms: 0, bars: [] })
  const smoothed = useRef<number[]>([])
  const meter = useRef<VolumeMeter | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const sensitivityRef = useRef(sensitivity)
  sensitivityRef.current = sensitivity
  const sourceRef = useRef(source)
  sourceRef.current = source
  const publish = (next: OverlayState) => {
    current.current = next
    setState(next)
  }
  const cleanup = () => {
    meter.current?.stop()
    meter.current = null
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const dismiss = () => {
    cleanup()
    publish(emptyOverlay())
  }
  const start = () => {
    cleanup()
    setSource('simulated')
    sourceRef.current = 'simulated'
    started.current = performance.now()
    publish(initial())
  }
  const stop = () => {
    cleanup()
    publish({ ...current.current, status: 'transcribing', message: 'Finishing' })
    timers.current.push(
      setTimeout(() => {
        publish({ ...current.current, status: 'success', message: 'Preview saved' })
        timers.current.push(setTimeout(dismiss, 1400))
      }, 900)
    )
  }
  const fail = (message = 'Connection interrupted. Your saved work is in History.') => {
    cleanup()
    publish({ ...current.current, status: 'error', message, bars: [], rms: 0 })
    timers.current.push(setTimeout(dismiss, 8000))
  }
  const startMic = async () => {
    cleanup()
    const next = new VolumeMeter()
    meter.current = next
    target.current = { rms: 0, bars: [] }
    setSource('microphone')
    sourceRef.current = 'microphone'
    started.current = performance.now()
    publish({ ...initial(), partial: 'Microphone preview · volume only, no transcription' })
    try {
      await next.start((level) => {
        target.current = level
      })
    } catch (error) {
      if (meter.current === next)
        fail(error instanceof Error ? error.message : 'Could not access microphone.')
    }
  }
  useEffect(() => {
    let frame = 0
    const tick = (now: number) => {
      const previous = current.current
      if (previous.status !== 'hidden') {
        const t = (now - started.current) / 1000
        const input =
          sourceRef.current === 'microphone'
            ? target.current
            : { rms: 0.08, bars: previewTarget(t * 3) }
        smoothed.current = composeOverlayBars({
          status: previous.status,
          current: smoothed.current,
          target: input.bars.map((value) => Math.min(1, value * sensitivityRef.current)),
          rms: input.rms,
          t
        })
        setBars(smoothed.current)
        if (previous.status === 'listening')
          publish({ ...previous, elapsedMs: now - started.current, rms: input.rms })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      cleanup()
    }
  }, [])
  return { state, bars, source, start, startMic, stop, dismiss, fail }
}
