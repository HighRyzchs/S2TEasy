import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultOverlayTheme, OVERLAY_SKINS, type OverlayTheme } from '@shared/overlay-theme'
import { idleUpdate, type UpdateStatus } from '@shared/types'
import { OverlayHud } from './OverlayHud'
import { OverlayThemeEditor } from './OverlayThemeEditor'
import { UpdatePanel } from './UpdatePanel'
import { useHudPreview } from './useHudPreview'
import './overlay-theme.css'
import './overlay-showcase.css'

const descriptions: Record<OverlayTheme['skin'], string> = {
  minimal: 'Quiet, focused, always in reach.',
  frost: 'A little light for your thoughts.',
  glass: 'Frosted edges. Soft reflections. Light through glass.',
  cyberpunk: 'After-hours signal. Mint meets ultraviolet.',
  pixel: 'One more thought. One more level.',
  studio: 'The original mixer, with six cores and five waves.'
}
function Sample({ skin, vertical = false }: { skin: OverlayTheme['skin']; vertical?: boolean }) {
  const demo = useHudPreview()
  const theme = {
    ...defaultOverlayTheme(),
    skin,
    showTranscript: !vertical,
    orientation: vertical ? ('vertical' as const) : ('horizontal' as const)
  }
  return (
    <article className={`sample sample-${skin}`}>
      <div className="sample-caption">
        <span>
          {OVERLAY_SKINS.find((entry) => entry.id === skin)?.label}
          {vertical ? ' · Vertical' : ''}
        </span>
        <button onClick={demo.start} title="Restart this preview">
          Replay ↗
        </button>
      </div>
      <div className={`hud-stage ${vertical ? 'vertical-stage' : ''}`}>
        <div className="desktop-texture" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {demo.state.status !== 'hidden' ? (
          <OverlayHud
            theme={theme}
            state={demo.state}
            bars={demo.bars}
            canStop={['listening', 'transcribing', 'inserting'].includes(demo.state.status)}
            onStop={demo.stop}
            onDismiss={demo.dismiss}
            preview
          />
        ) : (
          <button className="replay-hud" onClick={demo.start}>
            Overlay dismissed · Replay
          </button>
        )}
      </div>
      <p>{descriptions[skin]}</p>
    </article>
  )
}
function Showcase() {
  const [theme, setTheme] = useState<OverlayTheme>({ ...defaultOverlayTheme(), skin: 'glass' })
  const [update, setUpdate] = useState<UpdateStatus>({
    ...idleUpdate('1.4.0', 'portable'),
    phase: 'available',
    availableVersion: '1.5.0',
    message: 'Simulated update preview'
  })
  const [autoDownload, setAutoDownload] = useState(false)
  return (
    <main className="showcase">
      <section id="overlay-comparison">
        <header>
          <a className="studio-wordmark" href="../">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <rect width="40" height="40" rx="12" fill="#a5e6ce" />
              <path
                d="M10 19v3m5-9v15m5-19v22m5-17v12m5-7v3"
                stroke="#122c24"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            S2Teasy <span>/ Overlay studio</span>
          </a>
          <span className="build-label">
            <i /> LIVE COMPONENT PREVIEW
          </span>
        </header>
        <div className="study-title">
          <span className="overline">YOUR VOICE. YOUR ATMOSPHERE.</span>
          <h1>
            A small window.
            <br />A world of possibilities.
          </h1>
          <p>Six looks. Moving waveforms. Make room for your own kind of flow.</p>
        </div>
        <div className="options-head">
          <h2>Find your frequency.</h2>
          <span>SIMULATED SPEECH · TRY STOP, CANCEL & REPLAY</span>
        </div>
        <div className="looks-grid">
          {OVERLAY_SKINS.map(({ id }) => (
            <Sample key={id} skin={id} />
          ))}
        </div>
        <div className="design-notes">
          <span>
            <b>01</b> Volume-driven waveforms
          </span>
          <span>
            <b>02</b> Stop, finish & dismiss
          </span>
          <span>
            <b>03</b> Your image. Your layout.
          </span>
        </div>
      </section>
      <section className="try-controls" id="playground">
        <div className="options-head">
          <div>
            <span className="overline">MAKE YOURSELF AT HOME</span>
            <h2>Your overlay, your way.</h2>
          </div>
          <span>LOCAL PREVIEW · NOTHING IS UPLOADED</span>
        </div>
        <p className="section-intro">
          Try your microphone, switch to a vertical layout, tune the color and size, or bring an
          image of your own. The controls below use the app’s actual overlay editor.
        </p>
        <OverlayThemeEditor theme={theme} onChange={setTheme} />
        <p className="desktop-note">
          Desktop placement options: top, bottom, four corners, either side, or center. Glass
          transparency and desktop blur depend on Windows composition; this browser preview can blur
          the scene behind it. Windows focus and always-on-top behavior require a desktop test.
        </p>
      </section>
      <section id="update-preview">
        <div className="options-head">
          <h2>In-app updates</h2>
          <span>SIMULATION · NO DOWNLOAD</span>
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
      <footer className="site-footer">
        <a href="https://github.com/HighRyzchs/S2TEasy">Open source. Open to your ideas. ↗</a>
        <span>Built for thoughts worth keeping.</span>
      </footer>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Showcase />)
