import { useEffect, useRef, useState } from 'react'
import { WAVEFORM_BARS } from '@shared/constants'
import {
  defaultOverlayTheme,
  normalizeOverlayTheme,
  type OverlayTheme
} from '@shared/overlay-theme'
import { defaultSettings, emptyOverlay, type OverlayState } from '@shared/types'
import { composeOverlayBars, previewTarget } from '@shared/waveform'
import { OverlayHud } from './OverlayHud'
import { OutputChoices } from './OutputChoices'
import type { OutputPreferences } from '@shared/output'

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
  const [output, setOutput] = useState(defaultSettings().output)
  const [outputBusy, setOutputBusy] = useState(false)
  const [outputMessage, setOutputMessage] = useState('')
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
      setOutput(app.settings.output)
      if (app.overlay && !receivedState.current) setState(app.overlay)
    })
    return window.s2t.onSettings((settings) => {
      setTheme(normalizeOverlayTheme(settings.overlayTheme))
      setOutput(settings.output)
    })
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

  const saveOutput = async (value: OutputPreferences) => {
    setOutputBusy(true)
    setOutputMessage('')
    try {
      setOutput((await window.s2t.saveOutput(value)).output)
    } catch {
      setOutputMessage('Could not save choices. Try again.')
    } finally {
      setOutputBusy(false)
    }
  }
  const copy = async (format: 'plain' | 'tags') => {
    setOutputMessage('')
    try {
      const id = stateRef.current.sessionId
      const ok = id
        ? await window.s2t.copyOutput(id, format)
        : await window.s2t.copyHistory(stateRef.current.partial)
      if (!ok) throw new Error('Clipboard busy')
      setOutputMessage(
        format === 'plain'
          ? 'Words copied · corrections kept'
          : stateRef.current.cueAnalysis?.cues.length
            ? 'Words + selected cues copied'
            : 'Words copied · no saved cues yet'
      )
    } catch {
      setOutputMessage('Copy failed. Try again.')
    }
  }
  return (
    <div
      className="hud-session"
      data-orientation={theme.orientation}
      style={{ '--overlay-scale': theme.scale } as React.CSSProperties}
    >
      <div className="hud-display">
        <OverlayHud
          state={state}
          bars={bars}
          theme={theme}
          canStop={canStop}
          live={!preview}
          preview={preview}
          onStop={stopRecording}
          onCopy={async () => {
            const id = stateRef.current.sessionId
            const ok = id
              ? await window.s2t.copyOutput(id, 'plain')
              : await window.s2t.copyHistory(stateRef.current.partial)
            if (!ok) throw new Error('Clipboard busy')
          }}
          onReview={() => {
            void window.s2t.reviewDictation()
          }}
          onDismiss={() => {
            setState(emptyOverlay())
            void window.s2t.cancelRecording().catch(() => undefined)
          }}
        />
      </div>
      <section className="hud-output" aria-label="Output and copy choices">
        <OutputChoices
          compact
          value={output}
          disabled={outputBusy}
          onChange={(value) => void saveOutput(value)}
        />
        <div className="hud-copy-row">
          <button disabled={!state.partial.trim()} onClick={() => void copy('plain')}>
            Copy words
          </button>
          <button disabled={!state.partial.trim()} onClick={() => void copy('tags')}>
            Copy with tags
          </button>
          <span>Word fixes stay ✓</span>
        </div>
        <div className="hud-output-message" role="status">
          {outputMessage ||
            state.cueError ||
            (state.cueAnalysis
              ? 'Timed audio cues ready · review interpretations before sharing'
              : 'Tags use saved audio cues; copy never starts a paid call.')}
        </div>
      </section>
    </div>
  )
}

function stopRecording(event: { preventDefault: () => void; stopPropagation: () => void }): void {
  event.preventDefault()
  event.stopPropagation()
  void window.s2t.stopRecording().catch(() => window.s2t.cancelRecording())
}

export { formatElapsed } from './OverlayHud'
