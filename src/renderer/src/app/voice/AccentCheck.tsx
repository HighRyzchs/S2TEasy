import { useMemo, useState } from 'react'
import { useApp } from '../context'
import { MicIcon, StopIcon } from '../icons'
import { accentResults } from './accent-check'
import { useVocabulary } from './useVocabulary'

/** Read six short sentences; every word that comes out as another word can be saved as an accent fix. */
export function AccentCheck() {
  const { settings, history, overlay, active, run } = useApp()
  const { learn } = useVocabulary()
  const [current, setCurrent] = useState('')
  const rows = useMemo(() => accentResults(history, settings.vocabulary), [history, settings.vocabulary])
  const recording = active && overlay.mode === 'practice' && current
  const done = rows.filter((row) => row.take).length
  const found = rows.reduce((n, row) => n + row.swaps.length, 0)

  return (
    <section className="card" aria-labelledby="accent-h">
      <div className="card-head">
        <h2 id="accent-h">Accent check</h2>
        <span className="hint">
          {done}/{rows.length} read{found ? ` · ${found} misheard` : ''}
        </span>
      </div>
      <p className="dim">
        Read each sentence at your normal pace. Words the engine turns into other words show up below it; save the ones
        that happen to you often as accent fixes.
      </p>
      <ol className="accent-list">
        {rows.map((row) => {
          const mine = recording === row.sentence
          return (
            <li key={row.sentence}>
              <div className="accent-line">
                <span className="accent-sentence">{row.sentence}</span>
                {mine ? (
                  <button className="btn small primary" type="button" onClick={() => void run(() => window.s2t.stopRecording())}>
                    <StopIcon /> Stop
                  </button>
                ) : (
                  <button
                    className="btn small"
                    type="button"
                    disabled={active}
                    onClick={() => {
                      setCurrent(row.sentence)
                      void run(() => window.s2t.startPractice(row.sentence))
                    }}
                  >
                    <MicIcon /> {row.take ? 'Again' : 'Read'}
                  </button>
                )}
              </div>
              {row.take && (
                <div className="accent-result">
                  <span className="hint">
                    Heard <q>{row.take.heard || '…nothing'}</q>
                  </span>
                  {row.swaps.length === 0 ? (
                    <span className="pill">All right</span>
                  ) : (
                    row.swaps.map((swap) => (
                      <span key={`${swap.meant}-${swap.heard}`} className="accent-swap">
                        <span className="mono">
                          {swap.heard} → {swap.meant}
                        </span>
                        {swap.saved ? (
                          <span className="pill">Saved</span>
                        ) : (
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => void run(() => learn(swap.heard, swap.meant, 'accent'))}
                          >
                            Save fix
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="hint">
        Accent fixes replace the heard word every time. Turn on “Check accent fixes in context” in Settings if a saved
        word is also one you really say.
      </p>
    </section>
  )
}
