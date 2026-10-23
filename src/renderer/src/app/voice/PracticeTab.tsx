import { useMemo, useState } from 'react'
import { useApp } from '../context'
import { MicIcon, StopIcon } from '../icons'
import { AccentCheck } from './AccentCheck'
import { useVocabulary } from './useVocabulary'
import { practiceQueue, takesFor, type Take } from './voice-logic'

const BADGE = {
  right: { text: 'Right', cls: '' },
  fixed: { text: 'Fixed by your word', cls: '' },
  new: { text: 'New way it gets misheard', cls: 'bad' },
  empty: { text: 'Nothing heard', cls: 'off' }
} as const

function TakeRow({ take, word, onAdd }: { take: Take; word: string; onAdd: () => void }) {
  const { result } = take
  return (
    <li className="take">
      <span className="mono faint take-n">Take {take.number}</span>
      <span className="take-heard">
        {result.kind === 'empty' ? <span className="dim">Nothing was heard</span> : <>Heard <q>{result.heard}</q></>}
      </span>
      <span className={`pill ${BADGE[result.kind].cls}`}>{BADGE[result.kind].text}</span>
      {result.kind === 'new' && (
        <button className="btn small" type="button" onClick={onAdd} aria-label={`Add “${result.heard}” as a heard-as form of ${word}`}>
          Add as heard-as
        </button>
      )}
    </li>
  )
}

export function PracticeTab({ requested, onPick }: { requested: string; onPick: (word: string) => void }) {
  const { settings, history, overlay, active, run } = useApp()
  const { learn } = useVocabulary()
  const queue = useMemo(() => practiceQueue(settings.vocabulary, requested), [settings.vocabulary, requested])
  const [picked, setPicked] = useState('')
  const word = picked || requested || queue[0] || ''
  const entry = settings.vocabulary.find((w) => w.meant.toLowerCase() === word.toLowerCase())
  const takes = useMemo(() => takesFor(history, word, settings.vocabulary), [history, word, settings.vocabulary])

  const mine = active && overlay.mode === 'practice'
  const other = active && !mine
  const status =
    overlay.status === 'transcribing' || overlay.status === 'inserting'
      ? 'Listening to what you said…'
      : overlay.status === 'paused'
        ? 'Paused'
        : 'Recording. Say it the way you normally would, then stop.'

  if (queue.length === 0 && !word) {
    return (
      <>
        <div className="empty">
          <strong>No words to practice yet.</strong>
          <p>Add a word on the Words tab, then come back to say it a few times. Each take shows what the engine heard.</p>
        </div>
        <AccentCheck />
      </>
    )
  }

  return (
    <>
      <section className="card" aria-label="Up next">
        <span className="label">Up next · words that get misheard most</span>
        <div className="queue" role="group" aria-label="Words to practice">
          {queue.map((q) => (
            <button
              key={q}
              type="button"
              className="chip queue-chip"
              aria-pressed={q.toLowerCase() === word.toLowerCase()}
              disabled={mine}
              onClick={() => {
                setPicked(q)
                onPick(q)
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </section>

      <section className="card stage" aria-label="Practice a word">
        <span className="label">Say it the way you normally would</span>
        <h2 className="target-word">{word}</h2>
        {entry?.hint && <p className="dim">sounds like {entry.hint}</p>}
        <div className="actions stage-actions">
          {mine ? (
            <>
              <button className="btn primary big" type="button" onClick={() => void run(() => window.s2t.stopRecording())}>
                <StopIcon /> Stop and save take
              </button>
              <button className="btn" type="button" onClick={() => void run(() => window.s2t.cancelRecording())}>Cancel</button>
            </>
          ) : (
            <button className="btn primary big" type="button" disabled={other || !word} onClick={() => void run(() => window.s2t.startPractice(word))}>
              <MicIcon /> Record “{word}”
            </button>
          )}
        </div>
        <p className="hint" role="status">
          {mine ? status : other ? 'A dictation is running. Finish it before recording a practice take.' : 'Hold your normal pace. One word or a short sentence with it is fine.'}
        </p>
      </section>

      <section className="card" aria-label="Your takes">
        <div className="card-head">
          <h2>Your takes</h2>
          <span className="hint">{takes.length ? `${takes.length} for “${word}”` : ''}</span>
        </div>
        {takes.length === 0 ? (
          <p className="dim">No takes of “{word}” yet. Record one above.</p>
        ) : (
          <ul className="take-list">
            {takes.map((t) => (
              <TakeRow
                key={t.id}
                take={t}
                word={word}
                onAdd={() => void run(async () => { await learn(t.result.heard, word, entry ? (entry.kind ?? 'name') : 'name') })}
              />
            ))}
          </ul>
        )}
      </section>

      <AccentCheck />

      <p className="hint practice-note">
        Practice collects the ways a word gets misheard and keeps your clips on this PC. It does not retrain the speech engine; it teaches S2Teasy what to fix.
      </p>
    </>
  )
}
