import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { WAVEFORM_BARS } from '@shared/constants'
import { normalizeHudSettings, type HudStyle } from '@shared/hud'
import type { OverlayState } from '@shared/types'
import { Hud } from '../../hud/Hud'
import { inertApi } from '../../hud/inertApi'
import './hud-screen.css'

const TEXT = '[calm] Yeah, I just talked to Ryzchs about the stream tonight. [excited] He wants to demo it live.'

const STILL: OverlayState = {
  status: 'listening',
  partial: TEXT,
  typedLength: TEXT.length - 22,
  message: 'Listening',
  rms: 0.08,
  elapsedMs: 0,
  bars: [],
  cues: true,
  sessionId: 'still'
}
const BARS = Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.9 + 0.6)))

const DESIGN_WIDTH = 680
const DESIGN_HEIGHT = 250

/** Scale factor that fits a design-width box into the width of its container. */
function useFit(designWidth: number): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.34)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / designWidth || 0.34)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [designWidth])
  return [ref, scale]
}

/**
 * One frozen frame of a style, scaled down with a transform. The HUD inside has no animation
 * loops and cannot be clicked, so a gallery of these costs nothing while idle.
 */
export function StaticHud({ style, accent }: { style: HudStyle; accent: string }) {
  const [fit, scale] = useFit(DESIGN_WIDTH)
  const bars = useRef(BARS)
  const inner = useRef<HTMLDivElement>(null)
  useEffect(() => {
    inner.current?.setAttribute('inert', '')
  }, [])
  return (
    <div
      ref={fit}
      className="hudsc-thumb"
      aria-hidden="true"
      style={{ height: DESIGN_HEIGHT * scale }}
    >
      <div className="hudsc-desk" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div
        ref={inner}
        className="hudsc-thumb-inner"
        style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})` }}
      >
        <Hud
          state={STILL}
          settings={normalizeHudSettings({ style, accent, whileTalking: 'compact' })}
          position={style === 'edge' || style === 'ghost' ? 'bottom' : 'center'}
          barsRef={bars}
          api={inertApi}
          defaultOpen
          keepOpen
          embedded
          still
        />
      </div>
    </div>
  )
}
