import { useEffect, useState } from 'react'
import type { VocabularyEntry, WordKind } from '@shared/vocabulary'
import { heardForms } from '@shared/vocabulary'
import { CloseIcon, PlusIcon } from '../icons'
import {
  addHeardAs,
  forgetWord,
  kindOf,
  patchWord,
  PICKABLE_KINDS,
  KIND_LABEL,
  removeHeardAs,
  setHint,
  setKind,
  statsSentence
} from './voice-logic'
import { useVocabulary } from './useVocabulary'

const when = (at: number) =>
  at ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Earlier'

export function WordDetail({
  entry,
  onPractice,
  onGone
}: {
  entry: VocabularyEntry
  onPractice: (word: string) => void
  onGone: () => void
}) {
  const { vocabulary, commit } = useVocabulary()
  const [error, setError] = useState('')
  const [hint, setHintText] = useState(entry.hint ?? '')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    setHintText(entry.hint ?? '')
    setAdding(false)
    setForm('')
    setConfirm(false)
    setError('')
  }, [entry.id, entry.hint])

  const apply = async (result: Parameters<typeof commit>[0]) => {
    const message = await commit(result)
    setError(message ?? '')
    return message === null
  }
  const kind = kindOf(entry)
  const forms = heardForms(entry)
  const isAccent = kind === 'accent'

  return (
    <aside className="card word-detail" aria-label={`Details for ${entry.meant}`}>
      <div className="word-detail-head">
        <h2 className="word-big">{entry.meant}</h2>
        <span className={`pill ${entry.enabled ? '' : 'off'}`}>{entry.enabled ? KIND_LABEL[kind] : 'Off'}</span>
      </div>

      <div className="field">
        <span className="label">Kind</span>
        <div className="seg" role="group" aria-label="Kind of word">
          {(kind === 'rule' ? [...PICKABLE_KINDS, 'rule' as WordKind] : PICKABLE_KINDS).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => void apply(setKind(vocabulary, entry.id, k))}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">Sounds like (optional)</span>
        <input
          className="input"
          value={hint}
          maxLength={60}
          placeholder="A reminder, like rizz-kss"
          onChange={(e) => setHintText(e.target.value)}
          onBlur={() => hint.trim() !== (entry.hint ?? '') && void apply(setHint(vocabulary, entry.id, hint))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="hint">Only a note for you. It is never used to match words.</span>
      </label>

      <div className="field">
        <span className="label">Heard as</span>
        <div className="chips">
          {forms.map((f) => (
            <span className="chip" key={f}>
              {f}
              {forms.length > 1 && (
                <button type="button" className="chip-x" aria-label={`Remove heard-as “${f}”`} onClick={() => void apply(removeHeardAs(vocabulary, entry.id, f))}>
                  <CloseIcon size={10} />
                </button>
              )}
            </span>
          ))}
          {adding ? (
            <form
              className="chip-add"
              onSubmit={(e) => {
                e.preventDefault()
                void apply(addHeardAs(vocabulary, entry.id, form)).then((ok) => {
                  if (ok) {
                    setForm('')
                    setAdding(false)
                  }
                })
              }}
            >
              <input
                className="input"
                autoFocus
                aria-label="New heard-as form"
                value={form}
                maxLength={120}
                placeholder="What it hears"
                onChange={(e) => setForm(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              />
              <button className="btn small primary" type="submit">Add</button>
            </form>
          ) : (
            <button type="button" className="chip chip-plus" onClick={() => setAdding(true)}>
              <PlusIcon size={11} /> add
            </button>
          )}
        </div>
        {error && <span role="alert" className="voice-error">{error}</span>}
      </div>

      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={!isAccent && entry.engineHint !== false}
            disabled={isAccent}
            onChange={(e) => void apply(patchWord(vocabulary, entry.id, { engineHint: e.target.checked }))}
          />
          <span>
            Hint the speech engine
            <small className="hint">
              {isAccent
                ? 'Not used for “How I say it” words: they are only fixed after the engine has heard you.'
                : 'Sent as a key term so it is heard right the first time.'}
            </small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={entry.enabled} onChange={(e) => void apply(patchWord(vocabulary, entry.id, { enabled: e.target.checked }))} />
          <span>
            Enabled
            <small className="hint">Turn off to keep the word without using it.</small>
          </span>
        </label>
      </div>

      <div className="field">
        <span className="label">So far</span>
        <p className="dim">{statsSentence(entry)}</p>
      </div>

      <div className="field">
        <span className="label">Your clips{entry.clips?.length ? ` · ${entry.clips.length}` : ''}</span>
        {entry.clips?.length ? (
          <ul className="clip-list">
            {[...entry.clips].reverse().map((c, i) => (
              <li key={`${c.sessionId}-${c.startMs}-${i}`}>
                <span className="mono">{((c.endMs - c.startMs) / 1000).toFixed(1)} s</span>
                <span className="faint">{when(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No clips yet. Practice this word to keep one on this PC.</p>
        )}
      </div>

      <div className="actions detail-actions">
        <button className="btn primary" type="button" onClick={() => onPractice(entry.meant)}>Practice this word</button>
        {confirm ? (
          <span className="actions">
            <span className="dim">Forget “{entry.meant}” and its clips?</span>
            <button
              className="btn small danger"
              type="button"
              onClick={() => void commit({ ok: true, vocabulary: forgetWord(vocabulary, entry.id) }).then((m) => (m ? setError(m) : onGone()))}
            >
              Yes, forget it
            </button>
            <button className="btn small" type="button" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : (
          <button className="link danger" type="button" onClick={() => setConfirm(true)}>Forget this word</button>
        )}
      </div>
    </aside>
  )
}
