import { useState } from 'react'
import type { VocabularyEntry } from '@shared/vocabulary'

export function VocabularyPanel({
  entries,
  onChange
}: {
  entries: VocabularyEntry[]
  onChange: (entries: VocabularyEntry[]) => Promise<void>
}) {
  const [heard, setHeard] = useState('')
  const [meant, setMeant] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const save = async (next: VocabularyEntry[]) => {
    setBusy(true)
    setError('')
    try {
      await onChange(next)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save vocabulary.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="panel-head">
        <div>
          <span className="eyebrow">A little more like you</span>
          <h2>Your vocabulary</h2>
          <p>Names, expressions, and the words you use every day.</p>
        </div>
        <span className="subtle-tag">{entries.length} / 500 rules</span>
      </div>
      <div className="vocabulary-intro">
        <span className="large-glyph" aria-hidden="true">
          Aa
        </span>
        <div>
          <h3>Teach it what you mean.</h3>
          <p>
            Explicit corrections apply to new finalized text. You control every rule. These are
            vocabulary preferences, not accent model training.
          </p>
        </div>
      </div>
      <section className="block">
        <h3>Add a correction</h3>
        <p className="hint">
          Use a distinctive phrase to avoid changing words that were already correct.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (entries.some((row) => row.heard.toLowerCase() === heard.trim().toLowerCase())) {
              setError('That phrase already has a rule. Remove it before adding a replacement.')
              return
            }
            void save([
              ...entries,
              { id: crypto.randomUUID(), heard: heard.trim(), meant: meant.trim(), enabled: true }
            ]).then((ok) => {
              if (ok) {
                setHeard('')
                setMeant('')
              }
            })
          }}
        >
          <div className="rule-form">
            <div className="field">
              <label htmlFor="heard">When it hears</label>
              <input
                id="heard"
                required
                maxLength={120}
                placeholder="rosin"
                value={heard}
                onChange={(e) => setHeard(e.target.value)}
              />
            </div>
            <span aria-hidden="true">→</span>
            <div className="field">
              <label htmlFor="meant">Write this instead</label>
              <input
                id="meant"
                required
                maxLength={120}
                placeholder="Roshan"
                value={meant}
                onChange={(e) => setMeant(e.target.value)}
              />
            </div>
            <button
              className="primary"
              disabled={busy || entries.length >= 500 || !heard.trim() || !meant.trim()}
            >
              Add word
            </button>
          </div>
        </form>
        {error && (
          <p className="status-bad" role="alert">
            {error}
          </p>
        )}
      </section>
      <div className="section-heading">
        <h3>Remembered corrections</h3>
        <input
          className="search"
          aria-label="Search vocabulary"
          placeholder="Find a word…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="word-list">
        {entries
          .filter((row) => `${row.heard} ${row.meant}`.toLowerCase().includes(query.toLowerCase()))
          .map((entry) => (
            <div className="word-row" key={entry.id}>
              <span className="heard-word">{entry.heard}</span>
              <span className="muted" aria-hidden="true">
                →
              </span>
              <strong>{entry.meant}</strong>
              <button
                disabled={busy}
                className={entry.enabled ? 'switch on' : 'switch'}
                role="switch"
                aria-label={`Apply ${entry.heard} to ${entry.meant}`}
                aria-checked={entry.enabled}
                onClick={() =>
                  void save(
                    entries.map((row) =>
                      row.id === entry.id ? { ...row, enabled: !row.enabled } : row
                    )
                  )
                }
              >
                <i />
              </button>
              <button
                className="ghost"
                disabled={busy}
                aria-label={`Remove ${entry.heard}`}
                onClick={() => void save(entries.filter((row) => row.id !== entry.id))}
              >
                ×
              </button>
            </div>
          ))}
      </div>
      {!entries.length && (
        <p className="micro">
          Your vocabulary is empty. Add a word here or remember a correction from History.
        </p>
      )}
      <section className="training-note">
        <span className="eyebrow">Pronunciation examples</span>
        <h3>Build a dataset you own.</h3>
        <p>
          Enable audio retention in Settings → Privacy & data, record a phrase in Voice practice or
          dictate normally, then correct it in History. Export WAV + text to save the audio with its
          intended transcript. Old text-only sessions cannot recover how you pronounced a word.
        </p>
        <p className="micro">
          No automatic fine-tuning runs. Provider-specific keyword boosting and acoustic adaptation
          need separate evaluation against recordings the model has not trained on.
        </p>
      </section>
    </>
  )
}
