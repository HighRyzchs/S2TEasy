import { useEffect, useRef, useState } from 'react'
import type { HudSettings } from '@shared/hud'
import { Hud } from '../../hud/Hud'
import { useBars } from '../../hud/useBars'
import { usePreviewSession, type PreviewMode } from '../../hud/usePreviewSession'
import type { PreviewState } from './styles'
import './hud-screen.css'

// About how wide the widest HUD style is at scale 1.
const HUD_WIDTH = 640

const MODES: Record<PreviewState, PreviewMode> = { talking: 'listening', editing: 'open', paused: 'paused' }

/** The real HUD fed by a simulated session, drawn inside the nearest positioned box. No IPC. */
function Session({
  mode,
  hud,
  position,
  onEnded
}: {
  mode: PreviewMode
  hud: HudSettings
  position: string
  onEnded: () => void
}) {
  const { state, api } = usePreviewSession(mode, true)
  const barsRef = useBars(state, hud.sensitivity, true)
  // After "Saved", start the demo over so the stage never sits empty.
  useEffect(() => {
    if (state.status !== 'success') return
    const timer = window.setTimeout(onEnded, 2400)
    return () => window.clearTimeout(timer)
  }, [state.status, onEnded])
  return (
    <Hud
      state={state}
      settings={hud}
      position={position}
      barsRef={barsRef}
      api={api}
      defaultOpen={mode === 'open'}
      keepOpen={mode === 'open'}
      embedded
    />
  )
}

/** A dark "desktop" with the live preview in it. `nonce` restarts the demo. */
export function LiveHud({
  hud,
  position,
  state,
  nonce = 0,
  className = ''
}: {
  hud: HudSettings
  position: string
  state: PreviewState
  nonce?: number
  className?: string
}) {
  const [round, setRound] = useState(0)
  useEffect(() => setRound(0), [state, nonce])
  // In a narrow window the preview shrinks to fit instead of being cut off.
  const stage = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  useEffect(() => {
    const el = stage.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setFit(Math.min(1, (el.clientWidth - 24) / HUD_WIDTH)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const shown = fit < 1 ? { ...hud, scale: Math.max(0.5, hud.scale * fit) } : hud
  return (
    <div className={`hudsc-stage ${className}`} ref={stage}>
      <div className="hudsc-desk" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <Session
        key={`${state}-${nonce}-${round}`}
        mode={MODES[state]}
        hud={shown}
        position={position}
        onEnded={() => setRound((n) => n + 1)}
      />
    </div>
  )
}
