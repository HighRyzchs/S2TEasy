import { useEffect, useRef, useState } from 'react'

type Capture = {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  analyser: AnalyserNode
  chunks: Blob[]
  frame: number
  timer: ReturnType<typeof setTimeout> | null
  discard: boolean
}

/** A local, bounded audio example. No speech-recognition service or upload is used. */
export function VoiceLabRecorder({
  blob,
  onChange,
  onBusyChange
}: {
  blob?: Blob
  onChange: (blob: Blob | undefined) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [phase, setPhase] = useState<'idle' | 'asking' | 'recording' | 'stopping'>('idle')
  useEffect(() => {
    onBusyChange(phase !== 'idle')
  }, [phase, onBusyChange])
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(Array(28).fill(3))
  const [url, setUrl] = useState('')
  const player = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const element = player.current
    return () => {
      if (!element) return
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
  }, [url])
  const capture = useRef<Capture | null>(null)
  const generation = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!blob) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  function release(active: Capture) {
    cancelAnimationFrame(active.frame)
    if (active.timer) clearTimeout(active.timer)
    active.stream.getTracks().forEach((track) => track.stop())
    void active.context.close().catch(() => {})
  }
  function abort() {
    generation.current++
    const active = capture.current
    capture.current = null
    if (active) {
      active.discard = true
      if (active.recorder.state !== 'inactive') active.recorder.stop()
      release(active)
    }
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        abort()
        setPhase('idle')
        setLevels(Array(28).fill(3))
      }
    }
    const leaving = () => abort()
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', leaving)
    return () => {
      abort()
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', leaving)
    }
  }, [])

  async function start() {
    const token = ++generation.current
    setError('')
    setPhase('asking')
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Recording needs a browser with microphone support, on HTTPS or localhost.')
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      context = new AudioContext()
      await context.resume()
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        await context.close()
        return
      }
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const recorder = new MediaRecorder(stream)
      const active: Capture = {
        stream,
        context,
        analyser,
        recorder,
        chunks: [],
        frame: 0,
        timer: null,
        discard: false
      }
      capture.current = active
      recorder.ondataavailable = (event) => {
        if (event.data.size) active.chunks.push(event.data)
      }
      recorder.onstop = () => {
        release(active)
        if (active.discard || token !== generation.current) return
        capture.current = null
        const next = new Blob(active.chunks, { type: recorder.mimeType })
        if (next.size) onChangeRef.current(next)
        else setError('That take was empty. Please try recording again.')
        setPhase('idle')
        setLevels(Array(28).fill(3))
      }
      recorder.onerror = () => {
        abort()
        setPhase('idle')
        setError('The microphone stopped unexpectedly. Please try again.')
      }
      recorder.start(100)
      setPhase('recording')
      const began = performance.now()
      const values = new Uint8Array(analyser.fftSize)
      const tick = () => {
        if (capture.current !== active) return
        analyser.getByteTimeDomainData(values)
        const rms = Math.sqrt(
          values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / values.length
        )
        setLevels((old) => [...old.slice(1), Math.max(3, Math.min(44, rms * 230))])
        setSeconds((performance.now() - began) / 1000)
        active.frame = requestAnimationFrame(tick)
      }
      tick()
      active.timer = setTimeout(() => {
        if (capture.current === active && recorder.state === 'recording') {
          setPhase('stopping')
          recorder.stop()
        }
      }, 15000)
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop())
      if (context && context.state !== 'closed') void context.close().catch(() => {})
      if (token !== generation.current) return
      capture.current = null
      setPhase('idle')
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Microphone access was declined. You can still save your word without a recording.'
          : cause instanceof Error
            ? cause.message
            : 'Could not open the microphone.'
      )
    }
  }
  const busy = phase !== 'idle'
  return (
    <div className="vl-recorder">
      <div className="vl-record-top">
        <div>
          <strong>Try saying it your way</strong>
          <span>Optional · up to 15 seconds · stays in this tab</span>
        </div>
        <span className="vl-time" aria-live="off">
          {phase === 'recording' ? `${seconds.toFixed(1)}s / 15s` : 'LOCAL AUDIO'}
        </span>
      </div>
      <div className="vl-record-row">
        <button
          type="button"
          className={`vl-record-button ${phase === 'recording' ? 'recording' : ''}`}
          disabled={phase === 'asking' || phase === 'stopping'}
          onClick={() => {
            if (phase === 'recording') {
              setPhase('stopping')
              capture.current?.recorder.stop()
            } else void start()
          }}
          aria-label={phase === 'recording' ? 'Stop recording' : 'Record example'}
        >
          {phase === 'recording' ? '■' : '●'}
        </button>
        <div
          className="vl-wave"
          role="img"
          aria-label={phase === 'recording' ? 'Live microphone volume' : 'Microphone is off'}
        >
          {levels.map((height, i) => (
            <i key={i} style={{ height }} />
          ))}
        </div>
        <span>
          {phase === 'asking'
            ? 'Allow your mic…'
            : phase === 'recording'
              ? 'Listening…'
              : phase === 'stopping'
                ? 'Saving take…'
                : 'Tap to record'}
        </span>
      </div>
      {busy && (
        <button
          type="button"
          className="vl-text-button"
          onClick={() => {
            abort()
            setPhase('idle')
            setLevels(Array(28).fill(3))
          }}
        >
          Cancel recording
        </button>
      )}
      {url && (
        <div className="vl-playback">
          <audio ref={player} controls src={url} aria-label="Your recorded example" />
          <button type="button" className="vl-text-button" onClick={() => onChange(undefined)}>
            Remove take
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="vl-error">
          {error}
        </p>
      )}
      <p className="vl-fine">
        This records and plays an example. It does not transcribe, recognize sounds, or train a
        model. Audio disappears when you reload or leave.
      </p>
    </div>
  )
}
