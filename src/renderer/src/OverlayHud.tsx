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

  if (theme.skin !== 'studio') {
    const failed = state.status === 'error'
    const done = state.status === 'success'
    const processing = state.status === 'transcribing' || state.status === 'inserting'
    const text = Array.from(state.partial)
    const subtitle = failed
      ? state.message
      : text.length > 120
        ? `…${text.slice(-120).join('')}`
        : state.partial
    const label = failed
      ? 'Needs attention'
      : done
        ? state.mode === 'practice'
          ? 'Practice saved'
          : 'Saved & inserted'
        : state.status === 'arm-paste'
          ? 'Choose a text field'
          : processing
            ? theme.showTranscript
              ? 'Finishing your thought'
              : 'Finishing'
            : 'Listening'
    return (
      <div
        className={classes.join(' ')}
        data-status={state.status}
        data-skin={theme.skin}
        style={overlayThemeVars(theme) as CSSProperties}
      >
        <div
          className="minimal-hud"
          data-transcript={theme.showTranscript || failed ? 'true' : 'false'}
        >
          <div className={`minimal-indicator ${processing ? 'processing' : ''}`} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {done ? (
                <path d="m5 12 4 4L19 6" />
              ) : failed ? (
                <>
                  <path d="M12 7v6" />
                  <path d="M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </>
              ) : processing ? (
                <path d="M20 12a8 8 0 1 1-5.5-7.6" />
              ) : (
                <>
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6" />
                </>
              )}
            </svg>
          </div>
          <div className="minimal-copy">
            <div className="minimal-heading">
              <span className="minimal-label" aria-live="polite">
                {label}
              </span>
              {!failed && !done && (
                <span className="minimal-clock">{formatElapsed(state.elapsedMs)}</span>
              )}
            </div>
            {(theme.showTranscript || failed) && (
              <div className="minimal-transcript" title={subtitle}>
                {subtitle || 'Your next thought starts here…'}
              </div>
            )}
          </div>
          {!failed && !done && (
            <div className="minimal-wave" aria-hidden="true">
              {bars
                .filter((_, i) => i % 2 === 0)
                .slice(0, 13)
                .map((height, index) => (
                  <i key={index} style={{ height: `${Math.max(3, height * 24)}px` }} />
                ))}
            </div>
          )}
          {canStop && (
            <button
              type="button"
              className="minimal-stop"
              aria-label="Stop recording"
              title="Stop recording"
              onPointerDown={onStop}
              onClick={onStop}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="6" y="6" width="8" height="8" rx="2" fill="currentColor" />
              </svg>
            </button>
          )}
          {failed && (
            <button
              type="button"
              className="minimal-stop"
              aria-label="Dismiss recording error"
              title="Dismiss"
              onClick={onDismiss}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m6 6 8 8m0-8-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={classes.join(' ')}
      data-status={state.status}
      data-skin="studio"
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
