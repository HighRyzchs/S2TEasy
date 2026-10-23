import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HUD_STYLES, hudAccent, normalizeHudSettings, type HudStyle } from '@shared/hud'
import { Logo } from './app/icons'
import { Choice, Slider } from './app/hud-screen/controls'
import { LiveHud } from './app/hud-screen/LiveHud'
import { StaticHud } from './app/hud-screen/StaticHud'
import { ACCENTS, PREVIEW_STATES, STYLE_INFO, type PreviewState } from './app/hud-screen/styles'
import './app/theme.css'
import './app/components.css'
import './overlay-showcase.css'

document.documentElement.dataset.appearance = 'system'

const PLACES = [
  { id: 'top', label: 'Top' },
  { id: 'center', label: 'Middle' },
  { id: 'bottom', label: 'Bottom' }
] as const

function Showcase() {
  const [style, setStyle] = useState<HudStyle>('island')
  const [accent, setAccent] = useState(hudAccent('island'))
  const [view, setView] = useState<PreviewState>('talking')
  const [talk, setTalk] = useState<'compact' | 'full'>('compact')
  const [scale, setScale] = useState(1)
  const [place, setPlace] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [nonce, setNonce] = useState(0)
  const hud = normalizeHudSettings({ style, accent, whileTalking: talk, scale })
  const current = HUD_STYLES.find((row) => row.id === style) ?? HUD_STYLES[0]
  const pick = (id: HudStyle) => {
    setStyle(id)
    setAccent(hudAccent(id))
  }

  return (
    <main className="demo">
      <header className="demo-bar">
        <a className="demo-brand" href="../">
          <Logo size={30} />
          S2Teasy
        </a>
        <nav aria-label="Site">
          <a href="../">Website</a>
          <a href="https://github.com/HighRyzchs/S2TEasy/releases/latest">Download</a>
          <a href="https://github.com/HighRyzchs/S2TEasy">GitHub</a>
        </nav>
      </header>

      <section className="demo-hero">
        <span className="label">The HUD · live demo</span>
        <h1>Your words, right where you are talking.</h1>
        <p>
          This is the real HUD from the desktop app, fed by simulated speech. Click a word to fix it, pause it, or pick a
          different look. No microphone, no uploads.
        </p>
      </section>

      <section className="card demo-stage-card" aria-label="HUD preview">
        <LiveHud hud={hud} position={place} state={view} nonce={nonce} className="demo-stage" />
        <div className="demo-controls">
          <Choice
            label="State"
            value={view}
            options={PREVIEW_STATES}
            onChange={(next) => {
              setView(next)
              setNonce((n) => n + 1)
            }}
          />
          <Choice label="Where" value={place} options={[...PLACES]} onChange={setPlace} />
          <Choice
            label="While you talk"
            value={talk}
            options={[
              { id: 'compact', label: 'One line' },
              { id: 'full', label: 'Full text' }
            ]}
            onChange={setTalk}
          />
          <div className="field">
            <span id="demo-color">Color</span>
            <div className="hudsc-swatches" role="radiogroup" aria-labelledby="demo-color">
              {ACCENTS.map((row) => (
                <button
                  key={row.value}
                  type="button"
                  role="radio"
                  className="hudsc-sw"
                  aria-checked={accent === row.value}
                  aria-label={row.name}
                  style={{ background: row.value }}
                  onClick={() => setAccent(row.value)}
                />
              ))}
            </div>
          </div>
          <Slider
            label="Size"
            value={scale}
            min={0.8}
            max={1.4}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={setScale}
          />
          <button type="button" className="btn" onClick={() => setNonce((n) => n + 1)}>
            Replay
          </button>
        </div>
      </section>

      <section aria-labelledby="demo-styles" className="demo-styles">
        <div className="demo-styles-head">
          <h2 id="demo-styles">Seven styles</h2>
          <p>
            <b>{current.label}.</b> {STYLE_INFO[current.id]}
          </p>
        </div>
        <div className="hudsc-gallery" role="radiogroup" aria-label="HUD style">
          {HUD_STYLES.map((row) => {
            const on = row.id === style
            return (
              <div
                key={row.id}
                className="hudsc-card"
                role="radio"
                aria-checked={on}
                aria-label={row.label}
                tabIndex={0}
                onClick={() => pick(row.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    pick(row.id)
                  }
                }}
              >
                <StaticHud style={row.id} accent={on ? accent : row.accent} />
                <strong>{row.label}</strong>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="demo-foot">
        <a href="https://github.com/HighRyzchs/S2TEasy">Open source. Open to your ideas. ↗</a>
        <span>Built for thoughts worth keeping.</span>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Showcase />
  </StrictMode>
)
