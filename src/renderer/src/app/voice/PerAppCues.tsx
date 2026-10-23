import { useMemo } from 'react'
import { appKey, type AppInfo } from '@shared/apps'
import { AppIcon } from '../AppIcon'
import { useApp } from '../context'

const CHOICES: { id: 'default' | 'on' | 'off'; name: string }[] = [
  { id: 'default', name: 'Default' },
  { id: 'on', name: 'On' },
  { id: 'off', name: 'Off' }
]

/** Speech cues on or off per program, for the apps you have dictated into. */
export function PerAppCues() {
  const { settings, history, save, run } = useApp()
  const rules = settings.appCues
  const apps = useMemo(() => {
    const seen = new Map<string, AppInfo>()
    for (const item of [...history].sort((a, b) => b.createdAt - a.createdAt)) {
      const key = appKey(item.app)
      if (key && item.app && !seen.has(key)) seen.set(key, item.app)
    }
    for (const key of Object.keys(rules)) if (!seen.has(key)) seen.set(key, { name: key, exe: `${key}.exe` })
    return [...seen.entries()].slice(0, 16)
  }, [history, rules])
  const globalOn = settings.speechCues.enabled && settings.speechCues.automatic

  const choose = (key: string, choice: 'default' | 'on' | 'off') => {
    const next = { ...rules }
    if (choice === 'default') delete next[key]
    else next[key] = choice === 'on'
    void run(() => save({ appCues: next }))
  }

  return (
    <section className="card" aria-labelledby="per-app-h">
      <div className="card-head">
        <h2 id="per-app-h">Per app</h2>
        <span className="hint">Default follows the switch above ({globalOn ? 'on' : 'off'})</span>
      </div>
      {apps.length === 0 ? (
        <p className="hint">Apps you dictate into show up here, so you can keep cues on in chat and off in email.</p>
      ) : (
        <ul className="per-app">
          {apps.map(([key, app]) => {
            const current = typeof rules[key] === 'boolean' ? (rules[key] ? 'on' : 'off') : 'default'
            return (
              <li key={key}>
                <AppIcon app={app} small />
                <span className="per-app-name">{app.name}</span>
                <div className="seg" role="group" aria-label={`Speech cues in ${app.name}`}>
                  {CHOICES.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      aria-pressed={current === choice.id}
                      onClick={() => choose(key, choice.id)}
                    >
                      {choice.name}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
