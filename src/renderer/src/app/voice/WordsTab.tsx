import { useMemo, useState } from 'react'
import { heardForms, type WordKind } from '@shared/vocabulary'
import { useApp } from '../context'
import { PlusIcon, SearchIcon } from '../icons'
import { voiceSuggestions, type VoiceSuggestion } from '../suggestions'
import { WordDetail } from './WordDetail'
import { useVocabulary } from './useVocabulary'
import { addWord, filterWords, kindOf, KIND_LABEL, PICKABLE_KINDS, recognition } from './voice-logic'

function Track({ entry }: { entry: Parameters<typeof recognition>[0] }) {
  const r = recognition(entry)
  if (!r) return <span className="faint" aria-label="No results yet">—</span>
  return (
    <span className="track" title={`${r.good} of ${r.total} went right`} role="img" aria-label={`${r.good} right, ${r.missed} missed`}>
      <span className="track-bar">
        <span style={{ width: `${(r.good / r.total) * 100}%` }} />
      </span>
      <span className="mono dim">{r.good}/{r.total}</span>
    </span>
  )
}

function Suggestions({ items }: { items: VoiceSuggestion[] }) {
  const { settings, save, run } = useApp()
  const { learn } = useVocabulary()
  if (!items.length) return null
  return (
    <section className="card" aria-label="From your sessions">
      <div className="card-head">
        <h2>From your sessions</h2>
        <span className="hint">Fixes you made by hand more than once</span>
      </div>
      <ul className="suggest-list">
        {items.map((s) => (
          <li key={s.key} className="suggest">
            <span>
              <span className="mono">{s.heard}</span> <span className="faint">→</span> <strong>{s.meant}</strong>
              <span className="faint"> · {s.count}×</span>
            </span>
            <span className="actions">
              <button className="btn small primary" type="button" onClick={() => void run(async () => { await learn(s.heard, s.meant, 'name') })}>
                Add
              </button>
              <button
                className="btn small"
                type="button"
                onClick={() => void run(() => save({ dismissedSuggestions: [...settings.dismissedSuggestions, s.key] }))}
              >
                Not now
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddWord({ onDone }: { onDone: (id?: string) => void }) {
  const { vocabulary, commit } = useVocabulary()
  const [heard, setHeard] = useState('')
  const [meant, setMeant] = useState('')
  const [kind, setKind] = useState<WordKind>('name')
  const [error, setError] = useState('')
  return (
    <form
      className="card add-word"
      onSubmit={(e) => {
        e.preventDefault()
        const id = crypto.randomUUID()
        const result = addWord(vocabulary, { heard, meant, kind }, () => id)
        void commit(result).then((message) => {
          if (message) return setError(message)
          const saved = result.ok ? result.vocabulary.find((w) => w.id === id) : undefined
          onDone(saved?.id)
        })
      }}
    >
      <h2>Add a word</h2>
      <div className="add-grid">
        <label className="field">
          <span>What it hears</span>
          <input className="input" autoFocus value={heard} maxLength={120} placeholder="as two teasy" onChange={(e) => setHeard(e.target.value)} />
        </label>
        <label className="field">
          <span>What you mean</span>
          <input className="input" value={meant} maxLength={120} placeholder="S2Teasy" onChange={(e) => setMeant(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>Kind</span>
        <div className="seg" role="group" aria-label="Kind of word">
          {PICKABLE_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <span className="hint">
          {kind === 'accent' ? 'For words the engine mishears because of how you say them. Only fixed afterwards.' : 'Names, keywords and phrases are also sent to the speech engine as hints.'}
        </span>
      </div>
      {error && <span role="alert" className="voice-error">{error}</span>}
      <div className="actions">
        <button className="btn primary" type="submit">Save word</button>
        <button className="btn" type="button" onClick={() => onDone()}>Cancel</button>
      </div>
    </form>
  )
}

export function WordsTab({
  selected,
  onSelect,
  onPractice
}: {
  selected: string
  onSelect: (id: string) => void
  onPractice: (word: string) => void
}) {
  const { settings, history } = useApp()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const words = settings.vocabulary
  const shown = useMemo(() => filterWords(words, query), [words, query])
  const suggestions = useMemo(
    () => voiceSuggestions(history, words, settings.dismissedSuggestions),
    [history, words, settings.dismissedSuggestions]
  )
  const current = words.find((w) => w.id === selected)

  return (
    <>
      <Suggestions items={suggestions} />
      <div className="toolbar">
        <label className="search">
          <SearchIcon size={15} />
          <input aria-label="Search words" placeholder="Search words" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="btn primary" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          <PlusIcon size={14} /> Add a word
        </button>
      </div>
      {adding && (
        <AddWord
          onDone={(id) => {
            setAdding(false)
            if (id) onSelect(id)
          }}
        />
      )}
      {words.length === 0 ? (
        <div className="empty">
          <strong>No words yet.</strong>
          <p>Add a name, a keyword or a word your accent turns into something else. S2Teasy fixes it every time and tells the speech engine about it.</p>
        </div>
      ) : (
        <div className="columns voice-columns">
          <section className="card word-table" aria-label="Your words">
            <div className="wrow whead" aria-hidden="true">
              <span>Word</span><span>Kind</span><span>Heard as</span><span>Recognized</span><span>Clips</span>
            </div>
            {shown.length === 0 && <p className="dim">No word matches “{query}”.</p>}
            {shown.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`wrow${w.id === selected ? ' on' : ''}${w.enabled ? '' : ' disabled'}`}
                aria-pressed={w.id === selected}
                onClick={() => onSelect(w.id)}
              >
                <strong className="word-name">{w.meant}</strong>
                <span className="dim">{KIND_LABEL[kindOf(w)]}</span>
                <span className="mono heard-text">{heardForms(w).join(', ')}</span>
                <Track entry={w} />
                <span className="mono dim">{w.clips?.length ?? 0}</span>
              </button>
            ))}
          </section>
          {current ? (
            <WordDetail entry={current} onPractice={onPractice} onGone={() => onSelect('')} />
          ) : (
            <div className="empty detail-empty">Pick a word to see how it is heard, fix it, or practice it.</div>
          )}
        </div>
      )}
    </>
  )
}
