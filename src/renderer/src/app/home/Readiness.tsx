import { HUD_STYLES } from '@shared/hud'
import { engineLabel, hasEngineKey, useApp } from '../context'
import { useMicrophoneName } from './useMicrophoneName'

export function Readiness() {
  const { settings, navigate } = useApp()
  const mic = useMicrophoneName(settings.microphoneId)
  const ready = hasEngineKey(settings)
  const style = HUD_STYLES.find((row) => row.id === settings.hud.style)?.label ?? 'Island'
  const seconds = Math.round(settings.finishAfterMs / 1000)
  return (
    <section className="grid-tiles home-tiles" aria-label="Readiness">
      <div className="tile">
        <span className="label">Speech engine</span>
        <strong className="tile-title">{engineLabel(settings)}</strong>
        <div className="tile-foot">
          <span className={ready ? 'state ok' : 'state'}>
            <i aria-hidden="true" />
            {ready ? 'Set up' : 'Not set up'}
          </span>
          <button type="button" className="link" onClick={() => navigate('settings', { section: 'engine' })}>
            {ready ? 'Change' : 'Set up'}
          </button>
        </div>
      </div>
      <div className="tile">
        <span className="label">Microphone</span>
        <strong className="tile-title">{mic}</strong>
        <div className="tile-foot">
          <span className="dim">Noise suppression {settings.noiseSuppression ? 'on' : 'off'}</span>
          <button type="button" className="link" onClick={() => navigate('settings', { section: 'mic' })}>
            Test
          </button>
        </div>
      </div>
      <div className="tile">
        <span className="label">How it types</span>
        <strong className="tile-title">
          {settings.insertMode === 'live' ? 'Live typing' : 'Draft first'} · {style} HUD
        </strong>
        <div className="tile-foot">
          <span className="dim">Finishes {seconds} s after a pause</span>
          <button type="button" className="link" onClick={() => navigate('hud')}>
            HUD settings
          </button>
        </div>
      </div>
    </section>
  )
}
