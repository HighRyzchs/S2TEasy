import { useEffect, useState } from 'react'
import type { MatchEvent, VoiceMemoryState } from '@shared/voice-memory'
import { useApp } from '../context'
import { Slider } from '../hud-screen/controls'
import { Toggle } from '../settings/controls'
import '../settings/settings.css'

const OUTCOME: Record<MatchEvent['outcome'], { text: string; cls: string }> = {
  applied: { text: 'Fixed', cls: '' },
  suggested: { text: 'Suggested', cls: '' },
  'already-right': { text: 'Heard right', cls: 'off' },
  unplaced: { text: 'No word timings', cls: 'bad' }
}

const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

/** Beta: personal acoustic memory. Settings, what it remembers, and a test log with match scores. */
export function VoiceMemoryTab() {
  const { settings, save, run } = useApp()
  const prefs = settings.voiceMemory
  const [state, setState] = useState<VoiceMemoryState>({ memories: [], recent: [], encrypted: false })
  useEffect(() => {
    let live = true
    void window.s2t.voiceMemory().then((next) => live && setState(next), () => undefined)
    const off = window.s2t.onVoiceMemory(setState)
    return () => {
      live = false
      off()
    }
  }, [])
  const change = (patch: Partial<typeof prefs>) => run(() => save({ voiceMemory: { ...prefs, ...patch } }))
  const forget = (kind: 'example' | 'memory' | 'all', id = '') => run(() => window.s2t.forgetVoiceMemory(kind, id))

  return (
    <div className="columns voice-columns expr">
      <div className="col">
        <section className="card" aria-labelledby="vm-h">
          <div className="card-head">
            <h2 id="vm-h">
              Voice memory <span className="pill">Beta</span>
            </h2>
          </div>
          <p className="dim">
            Fix a few words on the HUD while you talk, and S2Teasy keeps the sound of what you said with the words you
            meant. Next time it hears that sound, it underlines the words so one click fixes them, or fixes them for
            you in Auto. It works with any speech engine that reports word timings.
          </p>
          <div className="set-lines">
            <Toggle
              label="Remember how I say my words on this device"
              hint={
                state.encrypted
                  ? 'Sound examples are stored as encrypted voice fingerprints on this PC, never uploaded.'
                  : 'Sound examples are stored as voice fingerprints on this PC, never uploaded. This system offers no encryption for them.'
              }
              checked={prefs.enabled}
              onChange={(enabled) => void change({ enabled })}
            />
            <div className="line">
              <span>
                <span id="vm-mode">When it hears one</span>
                <span className="hint">Auto only fixes clear matches; everything else is underlined.</span>
              </span>
              <div className="seg" role="group" aria-labelledby="vm-mode">
                <button type="button" aria-pressed={prefs.mode === 'suggest'} onClick={() => void change({ mode: 'suggest' })}>
                  Underline
                </button>
                <button type="button" aria-pressed={prefs.mode === 'auto'} onClick={() => void change({ mode: 'auto' })}>
                  Auto-fix
                </button>
              </div>
            </div>
            <Slider
              label="Sensitivity"
              value={prefs.sensitivity}
              min={0}
              max={1}
              step={0.05}
              format={(value) => (value < 0.34 ? 'Cautious' : value < 0.67 ? 'Balanced' : 'Eager')}
              onCommit={(sensitivity) => void change({ sensitivity })}
            />
          </div>
        </section>

        <section className="card" aria-labelledby="vm-list-h">
          <div className="card-head">
            <h2 id="vm-list-h">What it remembers</h2>
            {state.memories.length > 0 && (
              <button type="button" className="link danger" onClick={() => void forget('all')}>
                Forget everything
              </button>
            )}
          </div>
          {state.memories.length === 0 ? (
            <p className="hint">
              Nothing yet. Turn it on, dictate, and click a misheard word on the HUD to fix it. You will see
              “Remembered how you say …”.
            </p>
          ) : (
            <ul className="vm-list">
              {state.memories.map((memory) => (
                <li key={memory.id}>
                  <div className="vm-row">
                    <strong>{memory.intended}</strong>
                    <span className="hint">
                      {memory.examples.length} {memory.examples.length === 1 ? 'example' : 'examples'} · suggested{' '}
                      {memory.stats.suggested} · fixed {memory.stats.applied}
                    </span>
                    <button type="button" className="link danger" onClick={() => void forget('memory', memory.id)}>
                      Forget
                    </button>
                  </div>
                  <div className="vm-examples">
                    {memory.examples.map((example) => (
                      <span key={example.id} className="chip">
                        heard “{example.heard}” · {(example.ms / 1000).toFixed(1)} s
                        <button
                          type="button"
                          className="vm-x"
                          aria-label={`Forget the example heard as ${example.heard}`}
                          onClick={() => void forget('example', example.id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="col">
        <section className="card" aria-labelledby="vm-log-h">
          <div className="card-head">
            <h2 id="vm-log-h">Test log</h2>
            <span className="hint">Lower score = surer match</span>
          </div>
          {state.recent.length === 0 ? (
            <p className="hint">Matches show up here with their score, so you can tune the sensitivity while testing.</p>
          ) : (
            <table className="vm-log">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Heard</th>
                  <th>Your words</th>
                  <th>Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {state.recent.slice(0, 30).map((event) => (
                  <tr key={`${event.at}-${event.intended}`}>
                    <td className="faint">{ago(event.at)}</td>
                    <td>{event.heard || '—'}</td>
                    <td>{event.intended}</td>
                    <td className="mono">{event.score.toFixed(2)}</td>
                    <td>
                      <span className={`pill ${OUTCOME[event.outcome].cls}`}>{OUTCOME[event.outcome].text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="hint">
          Beta: matching uses classic sound fingerprints and dynamic time warping on your device. It learns names and
          phrases from your own fixes; it does not retrain the speech engine. See{' '}
          <a href="https://github.com/HighRyzchs/S2TEasy/blob/main/docs/PERSONAL_ACOUSTIC_MEMORY.md" target="_blank" rel="noreferrer">
            how it works
          </a>
          .
        </p>
      </div>
    </div>
  )
}
