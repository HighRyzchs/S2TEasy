import type { CSSProperties } from 'react'
import { overlayThemeVars, type OverlayTheme } from '@shared/overlay-theme'
import type { OverlayState } from '@shared/types'

export function OverlayHud({
  state,
  bars,
  theme,
  canStop,
  live,
  preview,
  onStop,
  onDismiss
}: {
  state: OverlayState
  bars: number[]
  theme: OverlayTheme
  canStop: boolean
  live?: boolean
  preview?: boolean
  onDismiss?: () => void
  onStop?: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
}) {
  const classes = ['overlay-root']
  if (live) classes.push('live')
  if (preview) classes.push('preview')

  return (
    <div
      className={classes.join(' ')}
      data-status={state.status}
      data-core={theme.core}
      data-wave={theme.wave}
      data-bezel={theme.bezel}
      style={overlayThemeVars(theme) as CSSProperties}
    >
      <div className="hud">
        <i className="notch tl" />
        <i className="notch tr" />
        <i className="notch bl" />
        <i className="notch br" />
        <div className="rail" />
        <div className="scan" />
        <div className="core" aria-hidden="true">
          <span className="halo" />
          <span className="ring" />
          <span className="ring delay" />
          <span className="pulse" />
        </div>
        <div className="spectrum" aria-hidden="true">
          {bars.map((height, index) => (
            <i key={index} style={{ height: `${Math.max(4, height * 30)}px` }} />
          ))}
        </div>
        <div className="meta">
          <div className="row">
            <span className="chip" title={state.message}>
              {state.message || overlayLabel(state.status)}
            </span>
            {state.status === 'listening' ||
            state.status === 'transcribing' ||
            state.status === 'inserting' ? (
              <span className="clock">{formatElapsed(state.elapsedMs)}</span>
            ) : null}
          </div>
          {state.partial ? <div className="partial">{state.partial}</div> : null}
        </div>
        {state.status === 'error' && (
          <button
            type="button"
            className="abort"
            aria-label="Dismiss recording error"
            onClick={onDismiss}
          >
            <span>Dismiss</span>
          </button>
        )}
        {canStop ? (
          <button
            type="button"
            className="abort"
            aria-label="Stop recording"
            onPointerDown={onStop}
            onClick={onStop}
          >
            <span>Stop</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function overlayLabel(status: OverlayState['status']): string {
  if (status === 'listening') return 'Listening'
  if (status === 'transcribing') return 'Syncing'
  if (status === 'inserting') return 'Writing'
  if (status === 'success') return 'Inserted'
  if (status === 'arm-paste') return 'Click a field'
  if (status === 'error') return 'Fault'
  return ''
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
