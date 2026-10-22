import { useEffect, useRef, useState } from 'react'
import { WAVEFORM_BARS } from '@shared/constants'
import {
  defaultOverlayTheme,
  normalizeOverlayTheme,
  type OverlayTheme
} from '@shared/overlay-theme'
import { emptyOverlay, type OverlayState } from '@shared/types'
import { composeOverlayBars, previewTarget } from '@shared/waveform'
import { OverlayHud } from './OverlayHud'

const preview = import.meta.env.VITE_BROWSER_PREVIEW === '1'

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>(
    preview
      ? {
          status: 'listening',
          partial: 'Speak into any text field…',
          message: 'Listening',
          rms: 0.08,
          elapsedMs: 4200,
          bars: []
        }
      : emptyOverlay()
  )
  const [theme, setTheme] = useState<OverlayTheme>(defaultOverlayTheme)
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: WAVEFORM_BARS }, () => 0.1))
  const themeRef = useRef(theme)
  themeRef.current = theme
  const currentRef = useRef(bars)
  const stateRef = useRef(state)
  stateRef.current = state

  const receivedState = useRef(false)
  useEffect(
    () =>
      window.s2t.onOverlay((next) => {
        receivedState.current = true
        setState(next)
      }),
    []
  )

  useEffect(() => {
    void window.s2t.getState().then((app) => {
      setTheme(normalizeOverlayTheme(app.settings.overlayTheme))
      if (app.overlay && !receivedState.current) setState(app.overlay)
    })
    return window.s2t.onSettings((settings) =>
      setTheme(normalizeOverlayTheme(settings.overlayTheme))
    )
  }, [])

  useEffect(() => {
    if (state.status === 'hidden' && !preview) return
    let frame = 0
    const began = performance.now()
    const tick = () => {
      const t = (performance.now() - began) / 1000
      const current = stateRef.current
      const target = preview
        ? previewTarget(t)
        : current.bars.map((bar) => Math.min(1, bar * themeRef.current.sensitivity))
      const next = composeOverlayBars({
        status: current.status,
        target,
        current: currentRef.current,
        t,
        rms: preview ? 0.07 + 0.025 * Math.sin(t * 1.15) : current.rms
      })
      currentRef.current = next
      setBars(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state.status === 'hidden'])

  if (state.status === 'hidden' && !preview) return null

  const canStop =
    state.status === 'listening' || state.status === 'transcribing' || state.status === 'inserting'

  return (
    <OverlayHud
      state={state}
      bars={bars}
      theme={theme}
      canStop={canStop}
      live={!preview}
      preview={preview}
      onStop={stopRecording}
      onDismiss={() => {
        setState(emptyOverlay())
        void window.s2t.cancelRecording().catch(() => undefined)
      }}
    />
  )
}

function stopRecording(event: { preventDefault: () => void; stopPropagation: () => void }): void {
  event.preventDefault()
  event.stopPropagation()
  void window.s2t.stopRecording().catch(() => window.s2t.cancelRecording())
}

export { formatElapsed } from './OverlayHud'
