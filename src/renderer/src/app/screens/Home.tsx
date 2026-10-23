import { useMemo } from 'react'
import { formatHotkey } from '@shared/hotkey'
import { hasEngineKey, useApp } from '../context'
import { PlayIcon, StopIcon } from '../icons'
import { FirstRun } from '../home/FirstRun'
import { Readiness } from '../home/Readiness'
import { RecentSessions } from '../home/RecentSessions'
import { VoiceNoticed } from '../home/VoiceNoticed'
import { WeekCard } from '../home/WeekCard'
import '../home/home.css'

const STATE_LABEL: Record<string, string> = {
  listening: 'Listening',
  paused: 'Paused',
  transcribing: 'Finishing your words',
  inserting: 'Typing your words'
}

export function Home() {
  const { settings, history, overlay, active, ready, run, navigate } = useApp()
  const recent = useMemo(
    () => history.filter((item) => item.source !== 'practice').slice(0, 5),
    [history]
  )
  const keys = formatHotkey(settings.hotkey).split(' + ').filter(Boolean)
  const name = settings.displayName.trim()
  const start = () => {
    if (!hasEngineKey(settings)) navigate('settings', { section: 'engine' })
    else void run(() => window.s2t.toggleDictation())
  }
  return (
    <div className="page home">
      <header className="page-head">
        <div>
          <h1>{name ? `Ready when you are, ${name}` : 'Ready when you are'}</h1>
          <p>
            Press{' '}
            {keys.map((key, i) => (
              <span key={key}>
                {i > 0 && ' '}
                <span className="kbd">{key}</span>
              </span>
            ))}{' '}
            in any app and start talking. Click your words in the HUD to fix them as you go.
          </p>
        </div>
        <div className="actions">
          {active && (
            <span className="pill" role="status">
              {STATE_LABEL[overlay.status] ?? 'Working'}
            </span>
          )}
          <button type="button" className="btn primary" disabled={!ready} onClick={start}>
            {active ? <StopIcon /> : <PlayIcon />}
            {active ? 'Finish dictation' : hasEngineKey(settings) ? 'Start dictating' : 'Set up your engine'}
          </button>
        </div>
      </header>
      <Readiness />
      <div className="columns home-columns">
        {recent.length ? <RecentSessions items={recent} /> : <FirstRun />}
        <div className="home-side">
          <VoiceNoticed />
          <WeekCard />
        </div>
      </div>
    </div>
  )
}
