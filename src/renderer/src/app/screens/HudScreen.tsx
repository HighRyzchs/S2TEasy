import { useState, type KeyboardEvent } from 'react'
import { HUD_STYLES, hudAccent, type HudSettings, type HudStyle } from '@shared/hud'
import { OVERLAY_POSITIONS, type AppSettings } from '@shared/types'
import { errorMessage, useApp } from '../context'
import { Toggle } from '../settings/controls'
import { Choice, NumberBox, Slider } from '../hud-screen/controls'
import { LiveHud } from '../hud-screen/LiveHud'
import { StaticHud } from '../hud-screen/StaticHud'
import { ACCENTS, PREVIEW_STATES, STYLE_INFO, type PreviewState } from '../hud-screen/styles'
import '../settings/settings.css'
import '../hud-screen/hud-screen.css'

const SPOTS: { id: (typeof OVERLAY_POSITIONS)[number]; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'left', label: 'Middle left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Middle right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' }
]

const HEX = /^#[0-9a-f]{6}$/i

export function HudScreen() {
  const { settings, save, run, active } = useApp()
  const hud = settings.hud
  const [view, setView] = useState<PreviewState>('talking')
  const [nonce, setNonce] = useState(0)
  const [error, setError] = useState('')
  const [hex, setHex] = useState<string | null>(null)

  const apply = async (patch: Partial<AppSettings>) => {
    try {
      await save(patch)
      setError('')
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }
  const setHud = (patch: Partial<HudSettings>) => apply({ hud: { ...hud, ...patch } })
  const pickStyle = (style: HudStyle) => apply({ hud: { ...hud, style, accent: hudAccent(style) } })

  const current = HUD_STYLES.find((row) => row.id === hud.style) ?? HUD_STYLES[0]
  const spot = SPOTS.find((row) => row.id === settings.overlayPosition) ?? SPOTS[7]
  const preset = ACCENTS.some((row) => row.value === hud.accent)
  const typedHex = hex ?? hud.accent

  const commitHex = (value: string) => {
    const next = value.startsWith('#') ? value : `#${value}`
    if (HEX.test(next)) void setHud({ accent: next.toLowerCase() })
    setHex(null)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>HUD</h1>
          <p>The small window that shows your words while you talk. Click them to fix them; it stays out of the way otherwise.</p>
        </div>
      </div>

      {error && (
        <div className="hudsc-error" role="alert">
          {error}
        </div>
      )}

      <section className="card" aria-label="Preview">
        <div className="hudsc-preview">
          <LiveHud hud={hud} position={settings.overlayPosition} state={view} nonce={nonce} />
          <div className="hudsc-preview-side">
            <span className="label">Selected style</span>
            <h2>{current.label}</h2>
            <p>{STYLE_INFO[current.id]}</p>
            <div className="seg" role="group" aria-label="Preview state">
              {PREVIEW_STATES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={view === row.id}
                  onClick={() => {
                    setView(row.id)
                    setNonce((n) => n + 1)
                  }}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setNonce((n) => n + 1)}>
                Replay
              </button>
              <button
                type="button"
                className="btn"
                disabled={active}
                title={active ? 'Available when you are not dictating' : undefined}
                onClick={() => void run(() => window.s2t.hudDemo())}
              >
                Show it on my screen
              </button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="hud-styles" className="set-lines" style={{ gap: 10 }}>
        <h2 id="hud-styles" className="label hudsc-section-title">
          Style
        </h2>
        <div className="hudsc-gallery" role="radiogroup" aria-label="HUD style">
          {HUD_STYLES.map((row) => {
            const on = row.id === hud.style
            const choose = () => void pickStyle(row.id)
            const key = (event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                choose()
              }
            }
            return (
              <div
                key={row.id}
                className="hudsc-card"
                role="radio"
                aria-checked={on}
                aria-label={row.label}
                tabIndex={0}
                onClick={choose}
                onKeyDown={key}
              >
                <StaticHud style={row.id} accent={on ? hud.accent : row.accent} />
                <strong>{row.label}</strong>
              </div>
            )
          })}
        </div>
      </section>

      <div className="hudsc-cols">
        <section className="card" aria-labelledby="hud-look">
          <h2 id="hud-look">Look</h2>
          <div className="field">
            <span id="hud-color">Color</span>
            <div className="hudsc-swatches" role="radiogroup" aria-labelledby="hud-color">
              {ACCENTS.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  role="radio"
                  aria-checked={hud.accent === row.value}
                  aria-label={row.name}
                  className="hudsc-sw"
                  style={{ background: row.value }}
                  onClick={() => void setHud({ accent: row.value })}
                />
              ))}
              <span
                className="hudsc-sw custom"
                role="radio"
                aria-checked={!preset}
                aria-label="Custom color"
                style={!preset ? { background: hud.accent } : undefined}
              >
                <input
                  type="color"
                  aria-label="Pick a custom color"
                  value={hud.accent}
                  onChange={(event) => void setHud({ accent: event.target.value })}
                />
              </span>
              <input
                className="input hudsc-hex"
                aria-label="Color as hex"
                spellCheck={false}
                maxLength={7}
                value={typedHex}
                onChange={(event) => setHex(event.target.value)}
                onBlur={(event) => commitHex(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitHex(event.currentTarget.value)
                }}
              />
            </div>
          </div>
          <Slider
            label="Size"
            value={hud.scale}
            min={0.8}
            max={1.4}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={(scale) => void setHud({ scale })}
          />
          <Choice
            label="While you talk"
            value={hud.whileTalking}
            options={[
              { id: 'compact', label: 'One line' },
              { id: 'full', label: 'Full text' }
            ]}
            onChange={(whileTalking) => void setHud({ whileTalking })}
          />
        </section>

        <section className="card" aria-labelledby="hud-behave">
          <h2 id="hud-behave">Behavior</h2>
          <Choice
            label="Typing"
            value={settings.insertMode}
            options={[
              { id: 'live', label: 'Live' },
              { id: 'final', label: 'Draft first' }
            ]}
            onChange={(insertMode) => void apply({ insertMode })}
          />
          <p className="hudsc-note">
            Live types words as you say them. Draft first waits and types everything at the end. Press your shortcut to
            start and to pause; a paused session finishes by itself after the delay below.
          </p>
          <Slider
            label="Finish after a pause"
            value={settings.finishAfterMs / 1000}
            min={2}
            max={30}
            step={0.5}
            format={(v) => `${v} s`}
            onCommit={(seconds) => void apply({ finishAfterMs: Math.round(seconds * 1000) })}
          />
          <Slider
            label="Wave sensitivity"
            value={hud.sensitivity}
            min={0.5}
            max={2}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={(sensitivity) => void setHud({ sensitivity })}
          />
          <div className="set-lines">
            <Toggle label="Show the Cues switch" checked={hud.showCues} onChange={(showCues) => void setHud({ showCues })} />
            <Toggle
              label="Click my words to edit them"
              checked={hud.clickToEdit}
              onChange={(clickToEdit) => void setHud({ clickToEdit })}
            />
            <Toggle
              label="Show the HUD while dictating"
              checked={settings.showOverlay}
              onChange={(showOverlay) => void apply({ showOverlay })}
            />
          </div>
        </section>

        <section className="card" aria-labelledby="hud-where">
          <h2 id="hud-where">Position</h2>
          <div className="hudsc-spots" role="radiogroup" aria-label="Where the HUD sits">
            {SPOTS.map((row) => (
              <button
                key={row.id}
                type="button"
                role="radio"
                className="hudsc-spot"
                aria-checked={settings.overlayPosition === row.id}
                aria-label={row.label}
                onClick={() => void apply({ overlayPosition: row.id })}
              >
                <span />
              </button>
            ))}
          </div>
          <p className="dim">{spot.label} of the screen your mouse is on</p>
          <div className="hudsc-offsets">
            <NumberBox
              id="hud-offset-x"
              label="Horizontal offset (px)"
              value={settings.overlayOffsetX}
              min={-4000}
              max={4000}
              onCommit={(overlayOffsetX) => void apply({ overlayOffsetX })}
            />
            <NumberBox
              id="hud-offset-y"
              label="Vertical offset (px)"
              value={settings.overlayOffsetY}
              min={-4000}
              max={4000}
              onCommit={(overlayOffsetY) => void apply({ overlayOffsetY })}
            />
          </div>
          <p className="hudsc-note">
            Positive values move right or down. The HUD stays inside the screen. Applies to the next recording.
          </p>
        </section>
      </div>
    </div>
  )
}
