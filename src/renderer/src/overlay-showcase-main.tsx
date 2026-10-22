import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultOverlayTheme, type OverlayTheme } from '@shared/overlay-theme'
import { emptyOverlay, type OverlayState } from '@shared/types'
import { OverlayHud } from './OverlayHud'
import { UpdatePanel } from './UpdatePanel'
import { idleUpdate, type UpdateStatus } from '@shared/types'
import './overlay-theme.css'
import './overlay-showcase.css'

const bars = [
  0.1, 0.22, 0.35, 0.6, 0.8, 0.45, 0.25, 0.5, 0.7, 0.9, 0.5, 0.3, 0.18, 0.3, 0.6, 0.8, 0.6, 0.4,
  0.2, 0.4, 0.7, 0.9, 0.5, 0.3, 0.4, 0.3, 0.15, 0.1
]
const listening: OverlayState = {
  ...emptyOverlay(),
  status: 'listening',
  message: 'Listening',
  partial: 'Let’s make room for the next idea.',
  elapsedMs: 12000,
  bars
}
function Hud({ theme, state = listening }: { theme: OverlayTheme; state?: OverlayState }) {
  return (
    <OverlayHud
      theme={theme}
      state={state}
      bars={bars}
      canStop={state.status === 'listening'}
      preview
    />
  )
}
function Showcase() {
  const [update, setUpdate] = useState<UpdateStatus>({
    ...idleUpdate('1.3.1', 'portable'),
    phase: 'available',
    availableVersion: '1.4.0',
    message: 'Simulated update preview'
  })
  const [autoDownload, setAutoDownload] = useState(false)
  const [skin, setSkin] = useState<OverlayTheme['skin']>('minimal')
  const [showTranscript, setShowTranscript] = useState(true)
  const theme = { ...defaultOverlayTheme(), skin, showTranscript }
  const legacy: OverlayTheme = {
    ...defaultOverlayTheme(),
    skin: 'studio',
    coreHue: 190,
    coreSat: 85,
    coreLight: 72,
    waveHue: 190,
    waveSat: 80,
    waveLight: 68,
    bezelHue: 268
  }
  return (
    <main className="showcase">
      <section id="overlay-comparison">
        <header>
          <span className="studio-wordmark">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />
            </svg>
            S2Teasy <span>/ Overlay studio</span>
          </span>
          <span className="build-label">ACTUAL APP COMPONENTS · SIMULATED SPEECH</span>
        </header>
        <div className="study-title">
          <span className="overline">A LITTLE LESS INTERFACE</span>
          <h1>Stay in the thought.</h1>
          <p>A smaller silhouette. A quieter waveform. Your words, clearly.</p>
        </div>
        <div className="comparison-grid">
          <article className="sample old-sample">
            <div className="sample-caption">
              <span>BEFORE</span>
              <small>Original Studio HUD · 520 × 80</small>
            </div>
            <div className="hud-stage">
              <Hud theme={legacy} />
            </div>
          </article>
          <article className="sample new-sample">
            <div className="sample-caption">
              <span>NOW</span>
              <small>Ink · 424 × 64</small>
            </div>
            <div className="hud-stage">
              <Hud theme={defaultOverlayTheme()} />
            </div>
          </article>
        </div>
        <div className="design-notes">
          <span>
            <b>01</b> One clear Stop control
          </span>
          <span>
            <b>02</b> Recent words stay readable
          </span>
          <span>
            <b>03</b> No scan lines or glowing rings
          </span>
        </div>
        <div className="options-head">
          <h2>Three ways to make it yours.</h2>
          <span>Same component. Saved theme preferences.</span>
        </div>
        <div className="looks-grid">
          <article>
            <span className="look-label">
              INK <small>the new default</small>
            </span>
            <div className="mini-stage ink-stage">
              <Hud theme={{ ...defaultOverlayTheme(), showTranscript: false }} />
            </div>
          </article>
          <article>
            <span className="look-label">
              FROST <small>light, with contrast</small>
            </span>
            <div className="mini-stage frost-stage">
              <Hud theme={{ ...defaultOverlayTheme(), skin: 'frost', showTranscript: false }} />
            </div>
          </article>
          <article>
            <span className="look-label">
              LILAC <small>your accent color</small>
            </span>
            <div className="mini-stage lilac-stage">
              <Hud
                theme={{
                  ...defaultOverlayTheme(),
                  waveHue: 265,
                  waveSat: 75,
                  waveLight: 83,
                  showTranscript: false
                }}
              />
            </div>
          </article>
        </div>
        <div className="states-head">
          <h2>Clear at every step.</h2>
          <span>Finishing, saved, or needing attention.</span>
        </div>
        <div className="state-grid">
          <div className="hud-stage">
            <Hud
              theme={defaultOverlayTheme()}
              state={{ ...listening, status: 'transcribing', message: 'Finishing' }}
            />
          </div>
          <div className="hud-stage">
            <Hud
              theme={defaultOverlayTheme()}
              state={{ ...listening, status: 'success', message: 'Saved & inserted' }}
            />
          </div>
        </div>
        <footer>
          Rendered from the Electron app’s React HUD. This shows appearance; Windows z-order and
          microphone behavior need a desktop test.
        </footer>
      </section>
      <section className="try-controls">
        <h2>Try the look</h2>
        <div className="controls">
          <label>
            Style{' '}
            <select value={skin} onChange={(e) => setSkin(e.target.value as OverlayTheme['skin'])}>
              <option value="minimal">Ink</option>
              <option value="frost">Frost</option>
              <option value="studio">Original Studio</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={showTranscript}
              onChange={(e) => setShowTranscript(e.target.checked)}
            />{' '}
            Live transcript
          </label>
        </div>
        <div className="interactive-stage">
          <Hud theme={theme} />
        </div>
      </section>
      <section id="update-preview">
        <div className="options-head">
          <h2>In-app updates</h2>
          <span>SIMULATED STATES · NO RELEASE IS DOWNLOADED</span>
        </div>
        <UpdatePanel
          update={update}
          autoDownload={autoDownload}
          onAutoDownload={setAutoDownload}
          onUpdate={setUpdate}
          onCheck={async (download) =>
            download
              ? { ...update, phase: 'ready', percent: 100 }
              : { ...update, phase: 'available' }
          }
          onInstall={async () => ({
            ...update,
            phase: 'current',
            message: 'Preview only — no app was restarted or installed.'
          })}
        />
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Showcase />)
