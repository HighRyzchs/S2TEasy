import { useEffect, useRef, type MutableRefObject } from 'react'
import { WAVEFORM_BARS } from '@shared/constants'
import type { OverlayState } from '@shared/types'
import { composeOverlayBars, previewTarget } from '@shared/waveform'

/** The animated waveform, kept in a ref so the HUD does not re-render on every frame. */
export function useBars(
  state: OverlayState,
  sensitivity: number,
  simulated: boolean
): MutableRefObject<number[]> {
  const barsRef = useRef<number[]>(Array.from({ length: WAVEFORM_BARS }, () => 0.1))
  const stateRef = useRef(state)
  stateRef.current = state
  const sensitivityRef = useRef(sensitivity)
  sensitivityRef.current = sensitivity
  const hidden = state.status === 'hidden'

  useEffect(() => {
    if (hidden) return
    let frame = 0
    const began = performance.now()
    const tick = () => {
      const t = (performance.now() - began) / 1000
      const current = stateRef.current
      const target = simulated
        ? previewTarget(t)
        : current.bars.map((bar) => Math.min(1, bar * sensitivityRef.current))
      barsRef.current = composeOverlayBars({
        status: current.status,
        target,
        current: barsRef.current,
        t,
        rms: simulated ? 0.07 + 0.025 * Math.sin(t * 1.15) : current.rms
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [hidden, simulated])
  return barsRef
}
