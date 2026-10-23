import { useMemo, useState } from 'react'
import { useApp } from '../context'
import { voiceSuggestions } from '../suggestions'
import { plural } from '../history/format'

export function VoiceNoticed() {
  const { history, settings, save, run, toast, navigate } = useApp()
  const [done, setDone] = useState<string[]>([])
  const rows = useMemo(
    () =>
      voiceSuggestions(history, settings.vocabulary, [...settings.dismissedSuggestions, ...done], 3),
    [history, settings.vocabulary, settings.dismissedSuggestions, done]
  )
  return (
    <section className="card" aria-labelledby="noticed-h">
      <div className="card-head">
        <h2 id="noticed-h">Your voice noticed</h2>
        <button type="button" className="link" onClick={() => navigate('voice')}>
          Your voice
        </button>
      </div>
      {!rows.length ? (
        <p className="dim">
          Nothing to teach yet. When you fix a word by hand in the HUD, it shows up here so you can
          keep the fix.
        </p>
      ) : (
        <ul className="noticed-list">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="noticed-pair">
                <s className="faint">{row.heard}</s> → <b>{row.meant}</b>
              </div>
              <div className="dim noticed-note">You fixed this in {plural(row.count, 'session')}.</div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() =>
                    void run(async () => {
                      await window.s2t.learnWord({ heard: row.heard, meant: row.meant, kind: 'name' })
                      setDone((d) => [...d, row.key])
                      toast(`Added “${row.meant}” to Your voice`)
                    })
                  }
                >
                  Add as a name
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setDone((d) => [...d, row.key])
                    void run(() =>
                      save({ dismissedSuggestions: [...settings.dismissedSuggestions, row.key] })
                    )
                  }}
                >
                  Not now
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
