import { useEffect, useState } from 'react'
import type { HudSettings } from '@shared/hud'
import { Hud } from '../../hud/Hud'
import { useBars } from '../../hud/useBars'
import { usePreviewSession, type PreviewMode } from '../../hud/usePreviewSession'
import type { PreviewState } from './styles'
import './hud-screen.css'

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
  return (
    <div className={`hudsc-stage ${className}`}>
      <div className="hudsc-desk" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <Session
        key={`${state}-${nonce}-${round}`}
        mode={MODES[state]}
        hud={hud}
        position={position}
        onEnded={() => setRound((n) => n + 1)}
      />
    </div>
  )
}
