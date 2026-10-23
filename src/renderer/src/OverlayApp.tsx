import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultHudSettings, hudAccent, normalizeHudSettings, HUD_STYLES, type HudSettings } from '@shared/hud'
import { defaultSettings, emptyOverlay, type OverlayState } from '@shared/types'
import { Hud } from './hud/Hud'
import { useBars } from './hud/useBars'
import { usePreviewSession, type PreviewMode } from './hud/usePreviewSession'

const preview = import.meta.env.VITE_BROWSER_PREVIEW === '1'

export function OverlayApp() {
  return preview ? <PreviewOverlay /> : <LiveOverlay />
}

function LiveOverlay() {
  const [state, setState] = useState<OverlayState>(emptyOverlay)
  const [hud, setHud] = useState<HudSettings>(defaultHudSettings)
  const [position, setPosition] = useState(defaultSettings().overlayPosition as string)
  const barsRef = useBars(state, hud.sensitivity, false)

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
      setHud(app.settings.hud)
      setPosition(app.settings.overlayPosition)
      if (app.overlay && !receivedState.current) setState(app.overlay)
    })
    return window.s2t.onSettings((settings) => {
      setHud(settings.hud)
      setPosition(settings.overlayPosition)
    })
  }, [])

  if (state.status === 'hidden') return null
  return (
    <Hud
      state={state}
      settings={hud}
      position={position}
      barsRef={barsRef}
      onDismiss={() => {
        setState(emptyOverlay())
        void window.s2t.cancelRecording().catch(() => undefined)
      }}
    />
  )
}

/**
 * Browser preview with a simulated session. URL parameters:
 *   style=island|caption|edge|cyber|pixel|ghost|balloon
 *   state=listening|open|paused|success      accent=%23hex      scale=0.8..1.4
 *   talk=full (show the whole draft while talking)      click=0 (no click-to-edit)
 *   cues=0 (cues off)      position=top-left etc.
 */
function PreviewOverlay() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const hud = useMemo(() => {
    const style = HUD_STYLES.find((row) => row.id === params.get('style'))?.id ?? 'island'
    const accent = params.get('accent') ?? hudAccent(style)
    return normalizeHudSettings({
      style,
      accent,
      scale: Number(params.get('scale')) || 1,
      whileTalking: params.get('talk') === 'full' ? 'full' : 'compact',
      clickToEdit: params.get('click') !== '0'
    })
  }, [params])
  const requested = params.get('state')
  const mode: PreviewMode =
    requested === 'open' || requested === 'paused' || requested === 'success' ? requested : 'listening'
  const { state, api } = usePreviewSession(mode, params.get('cues') !== '0')
  const barsRef = useBars(state, hud.sensitivity, true)
  return (
    <Hud
      state={state}
      settings={hud}
      position={params.get('position') ?? 'bottom'}
      barsRef={barsRef}
      api={api}
      defaultOpen={mode === 'open'}
      keepOpen={mode === 'open'}
      preview
    />
  )
}
