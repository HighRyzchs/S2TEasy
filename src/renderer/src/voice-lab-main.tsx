import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceWorkspace } from './VoiceWorkspace'
import { VoiceClipPreview } from './VoiceClipPreview'
import {
  defaultModels,
  LAB_STORAGE,
  readLabDraft,
  sampleCalls,
  sampleCards,
  type BillingClass,
  type VoiceCard,
  type VoiceKind
} from './voice-lab-data'
import '@fontsource-variable/outfit'
import './voice-lab.css'

const kinds: { id: VoiceKind; label: string; icon: string; hint: string }[] = [
  {
    id: 'word',
    label: 'Words & names',
    icon: 'Aa',
    hint: 'Your name, your people, your everyday words.'
  },
  {
    id: 'phrase',
    label: 'Phrases',
    icon: '“ ”',
    hint: 'A little shorthand for the things you say a lot.'
  },
  {
    id: 'sound',
    label: 'Sound cues',
    icon: '♫',
    hint: 'Give a hum, click or personal sound a meaning.'
  }
]
const categoryLabels: Record<BillingClass, string> = {
  dictation: 'Dictation',
  recovery: 'Recovery',
  cues: 'Voice cues'
}
function initialDraft() {
  try {
    return readLabDraft(JSON.parse(localStorage.getItem(LAB_STORAGE) || 'null'))
  } catch {
    return readLabDraft(null)
  }
}
function Arrow() {
  return (
    <svg className="vl-arrow-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 12 12 4M4 4h8v8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function Brand() {
  return (
    <a className="vl-brand" href="../" aria-label="S2Teasy home">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="14" fill="currentColor" />
        <path
          d="M10 19v3m5-8v13m5-18v22m5-17v12m5-7v3"
          stroke="#193e32"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
      <span>
        S2Teasy<span className="vl-brand-dot">.</span>
      </span>
    </a>
  )
}
function EntryEditor({
  card,
  initialAudio,
  lastTake,
  existing,
  cards,
  onClose,
  onSave,
  onDelete
}: {
  card: VoiceCard
  initialAudio?: Blob
  lastTake?: Blob
  existing: boolean
  cards: VoiceCard[]
  onClose: () => void
  onSave: (card: VoiceCard, audio?: Blob) => void
  onDelete: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(card)
  const [blob, setBlob] = useState(initialAudio)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const isSound = draft.kind === 'sound'
  return (
    <dialog
      ref={dialog}
      className="vl-dialog"
      aria-labelledby="entry-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (
          e.target === e.currentTarget &&
          (e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom)
        )
          onClose()
      }}
    >
      <div className="vl-dialog-header">
        <span className="vl-overline">A LITTLE MORE YOU</span>
        <button className="vl-icon-button" onClick={onClose} aria-label="Close editor">
          ×
        </button>
      </div>
      <h2 id="entry-title">{existing ? 'Make it feel right.' : 'What should we remember?'}</h2>
      <p className="vl-muted">Start with one thing you’d love S2Teasy to get right.</p>
      <div className="vl-kind-picker" aria-label="Entry type">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            className={kind.id === draft.kind ? 'selected' : ''}
            aria-pressed={kind.id === draft.kind}
            onClick={() => {
              setDraft({ ...draft, kind: kind.id })
              setError('')
            }}
          >
            <span>{kind.icon}</span>
            {kind.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const heard = draft.heard.trim(),
            meant = draft.meant.trim()
          if (!heard || !meant) {
            setError('Add both fields so we know what goes with what.')
            return
          }
          if (
            cards.some(
              (row) =>
                row.id !== draft.id &&
                row.kind !== 'sound' &&
                !isSound &&
                row.heard.toLocaleLowerCase() === heard.toLocaleLowerCase()
            )
          ) {
            setError('That misheard text already has a rule. Edit its existing card instead.')
            return
          }
          if (cards.length >= 100 && !existing) {
            setError('This prototype holds up to 100 cards. Remove a card before adding another.')
            return
          }
          onSave({ ...draft, heard, meant, sample: false }, blob)
        }}
      >
        <label className="vl-field">
          {isSound ? 'Give your sound a name' : 'What does it usually hear?'}
          <input
            autoFocus
            maxLength={120}
            required
            value={draft.heard}
            onChange={(e) => setDraft({ ...draft, heard: e.target.value })}
            placeholder={
              isSound
                ? 'e.g. my happy hum'
                : draft.kind === 'word'
                  ? 'e.g. shiv on'
                  : 'e.g. on my way shortcut'
            }
          />
          <small>
            {isSound
              ? 'A label for your example, not a spoken trigger.'
              : 'Use the mistaken word or phrase you see in your transcript.'}
          </small>
        </label>
        <div className="vl-field-arrow" aria-hidden="true">
          ↓
        </div>
        <label className="vl-field">
          {isSound ? 'What should it mean?' : 'What should be written instead?'}
          <input
            maxLength={120}
            required
            value={draft.meant}
            onChange={(e) => setDraft({ ...draft, meant: e.target.value })}
            placeholder={
              isSound
                ? 'e.g. Sounds good 👍'
                : draft.kind === 'word'
                  ? 'e.g. Siobhán'
                  : 'e.g. On my way! See you soon.'
            }
          />
        </label>
        {isSound && (
          <p className="vl-note lavender">
            Sound shortcuts are a design experiment. Label a sound and optionally attach your
            completed take. Automatic sound recognition is not connected.
          </p>
        )}
        <div className="vw-attach-take">
          <strong>A voice example, if you’d like</strong>
          {blob && (
            <>
              <VoiceClipPreview blob={blob} />
              <button type="button" className="vl-text-button" onClick={() => setBlob(undefined)}>
                Remove attached audio
              </button>
            </>
          )}
          {lastTake && lastTake !== blob && (
            <button type="button" className="vl-secondary" onClick={() => setBlob(lastTake)}>
              Attach last completed take
            </button>
          )}
          <p>
            {lastTake
              ? 'Attach only if this take is a useful example for this card.'
              : 'Use the recorder in Your voice first, then attach the completed take here.'}{' '}
            Audio stays in this page session and disappears on reload.
          </p>
        </div>
        {!isSound && (
          <label className="vl-check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Use this correction in my output
          </label>
        )}
        {error && (
          <p className="vl-error" role="alert">
            {error}
          </p>
        )}
        <div className="vl-dialog-actions">
          {existing && (
            <button type="button" className="vl-text-button danger" onClick={onDelete}>
              Delete card
            </button>
          )}
          <button type="button" className="vl-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="vl-primary">
            {existing ? 'Save changes' : 'Add to my voice'}{' '}
            <span>
              <Arrow />
            </span>
          </button>
        </div>
      </form>
    </dialog>
  )
}
function Usage() {
  const [filter, setFilter] = useState<'all' | BillingClass>('all')
  const [hover, setHover] = useState<number | null>(null)
  const rows = sampleCalls.filter((row) => filter === 'all' || row.category === filter)
  const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
  const unknown = rows.filter((row) => row.cost === null).length
  const daily = Array.from({ length: 7 }, (_, day) =>
    rows.filter((row) => row.day === day).reduce((sum, row) => sum + (row.cost ?? 0), 0)
  )
  const max = Math.max(...daily, 0.001)
  const money = (amount: number) => `$${amount.toFixed(4)}`
  return (
    <section>
      <div className="vl-page-title">
        <span className="vl-overline">A CLEARER PICTURE</span>
        <h1>A little clarity. Every call.</h1>
        <p>See which part of your voice workflow is doing the spending.</p>
      </div>
      <p className="vl-note lavender">
        <strong>Sample analytics</strong> · Illustrative data only. No OpenRouter account is
        connected, and these amounts are not model price estimates.
      </p>
      <div className="vl-filter-row" aria-label="Billing categories">
        {(['all', 'dictation', 'recovery', 'cues'] as const).map((id) => (
          <button
            key={id}
            aria-pressed={filter === id}
            className={filter === id ? 'selected' : ''}
            onClick={() => {
              setFilter(id)
              setHover(null)
            }}
          >
            {id === 'all' ? 'Everything' : categoryLabels[id]}
          </button>
        ))}
      </div>
      <div className="vl-stat-grid">
        <article>
          <span>Reported spend</span>
          <strong data-testid="sample-cost">{money(cost)}</strong>
          <small>{unknown} calls with unknown cost excluded</small>
        </article>
        <article>
          <span>API calls</span>
          <strong>{rows.length}</strong>
          <small>{filter === 'all' ? 'Across all three categories' : categoryLabels[filter]}</small>
        </article>
        <article>
          <span>Average response</span>
          <strong>
            {(rows.reduce((sum, row) => sum + row.latency, 0) / Math.max(1, rows.length)).toFixed(
              2
            )}
            <em>s</em>
          </strong>
          <small>Sample provider response time</small>
        </article>
      </div>
      <div className="vl-usage-grid">
        <section className="vl-chart">
          <div>
            <span className="vl-overline">LAST 7 DAYS · SAMPLE</span>
            <h2>
              {hover === null
                ? 'Your week, at a glance.'
                : `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][hover]} · ${money(daily[hover]!)}`}
            </h2>
          </div>
          <div className="vl-bars">
            {daily.map((amount, i) => (
              <button
                key={i}
                aria-label={`${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}: ${money(amount)} reported sample spend`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(i)}
              >
                <span className="vl-bar-track">
                  <i style={{ height: `${(amount / max) * 100}%` }} />
                </span>
                <span>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
              </button>
            ))}
          </div>
        </section>
        <aside className="vl-breakdown">
          <h2>Where it goes</h2>
          {(Object.keys(categoryLabels) as BillingClass[]).map((id) => {
            const total = rows
              .filter((row) => row.category === id)
              .reduce((sum, row) => sum + (row.cost ?? 0), 0)
            return (
              <div key={id}>
                <span>
                  <i className={id} />
                  {categoryLabels[id]}
                </span>
                <strong>{money(total)}</strong>
              </div>
            )
          })}
          <p>
            Personal corrections <span className="vl-small-pill">PLANNED</span>
          </p>
          <small>A separate billing category when contextual correction is built.</small>
        </aside>
      </div>
      <section className="vl-calls">
        <div>
          <h2>The calls behind the chart</h2>
          <span className="vl-small-pill">SAMPLE DATA</span>
        </div>
        <div className="vl-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Model</th>
                <th>Response</th>
                <th>Reported cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((row) => (
                <tr key={row.id}>
                  <td>{categoryLabels[row.category]}</td>
                  <td>{row.model}</td>
                  <td>{row.latency.toFixed(2)}s</td>
                  <td>{row.cost === null ? 'Not reported' : money(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="vl-explainer">
        <summary>Why don’t my older OpenRouter calls appear?</summary>
        <p>
          The desktop app keeps its own call records on your device, using costs returned by the
          provider. It does not import your OpenRouter account’s historical activity. Older calls
          without a saved usage record cannot be rebuilt from transcript history. Missing prices
          stay “unknown”; they are not counted as free.
        </p>
        <p>
          Dictation is regular speech-to-text; recovery is retrying saved audio; voice cues are a
          separate audio-understanding request. These are workflow categories, not separate invoices
          from OpenRouter.
        </p>
      </details>
    </section>
  )
}
function VoiceLab() {
  const [initial] = useState(initialDraft)
  const [cards, setCards] = useState(initial.cards)
  const [models, setModels] = useState(initial.models)
  const [page, setPage] = useState<'voice' | 'usage'>('voice')
  const [lastTake, setLastTake] = useState<Blob>()
  const [editor, setEditor] = useState<{ card: VoiceCard; existing: boolean } | null>(null)
  const [audio, setAudio] = useState<Record<string, Blob>>({})
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [labRevision, setLabRevision] = useState(0)
  const resetDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    try {
      localStorage.setItem(LAB_STORAGE, JSON.stringify({ cards, models }))
      setStorageError('')
    } catch {
      setStorageError('Browser storage is unavailable or full. Changes will last only in this tab.')
    }
  }, [cards, models])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5500)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (resetting) resetDialog.current?.showModal()
  }, [resetting])
  const add = (kind: VoiceKind = 'word') =>
    setEditor({
      existing: false,
      card: { id: crypto.randomUUID(), kind, heard: '', meant: '', enabled: true, sample: false }
    })
  return (
    <div className="vl-app">
      <header className="vl-header">
        <Brand />
        <span className="vl-prototype-badge">
          <i /> INTERACTIVE DESIGN LAB
        </span>
        <a href="https://github.com/HighRyzchs/S2TEasy" target="_blank" rel="noreferrer">
          Open source <Arrow />
        </a>
      </header>
      <div className="vl-shell">
        <aside className="vl-sidebar">
          <div className="vl-workspace-label">YOUR LITTLE WORKSPACE</div>
          <nav aria-label="Prototype sections">
            {(
              [
                { id: 'voice', icon: '✳', label: 'Your voice' },
                { id: 'usage', icon: '▥', label: 'Usage & spend' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => {
                  setPage(item.id)
                  setNotice('')
                }}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
                {page === item.id && <i />}
              </button>
            ))}
          </nav>
          <div className="vl-sidebar-note">
            <span>♡</span>
            <strong>A space to try things.</strong>
            <p>Your words and preferences stay in this browser. No sign-in. No paid calls.</p>
            <button onClick={() => setResetting(true)}>Reset this demo ↻</button>
          </div>
          <a className="vl-back" href="../">
            ← Back to S2Teasy
          </a>
        </aside>
        <main className="vl-main">
          <div className="vl-preview-note">
            <span>✧</span>
            <p>
              Try the next chapter of S2Teasy.{' '}
              <strong>Browser prototype · desktop app unchanged.</strong>
            </p>
          </div>
          {storageError && (
            <p role="alert" className="vl-error">
              {storageError}
            </p>
          )}
          <VoiceWorkspace
            key={labRevision}
            active={page === 'voice'}
            editorOpen={!!editor || resetting}
            cards={cards}
            audio={audio}
            models={models}
            onModelsChange={setModels}
            onTakeChange={setLastTake}
            onNotice={setNotice}
            onAdd={add}
            onEdit={(card) => setEditor({ card, existing: true })}
            onTeachWord={(word) => {
              const known = cards.find(
                (card) =>
                  card.kind !== 'sound' &&
                  (card.meant.toLocaleLowerCase() === word.toLocaleLowerCase() ||
                    card.heard.toLocaleLowerCase() === word.toLocaleLowerCase())
              )
              setEditor(
                known
                  ? { card: known, existing: true }
                  : {
                      existing: false,
                      card: {
                        id: crypto.randomUUID(),
                        kind: 'word',
                        heard: word.slice(0, 120),
                        meant: word.slice(0, 120),
                        enabled: true,
                        sample: false
                      }
                    }
              )
            }}
          />
          {page === 'usage' && <Usage />}
          <footer className="vl-footer">
            <span>Made for the way you speak.</span>
            <span>
              <span>Local drafts · No audio uploads · No API keys</span>
              <button className="vl-text-button" onClick={() => setResetting(true)}>
                Reset demo
              </button>
            </span>
          </footer>
        </main>
      </div>
      <div className="vl-toast" role="status">
        {notice}
      </div>
      {editor && (
        <EntryEditor
          key={editor.card.id}
          {...editor}
          cards={cards}
          initialAudio={audio[editor.card.id]}
          lastTake={lastTake}
          onClose={() => setEditor(null)}
          onSave={(card, blob) => {
            setCards((old) =>
              editor.existing
                ? old.map((item) => (item.id === card.id ? card : item))
                : [...old, card]
            )
            setAudio((old) => {
              const next = { ...old }
              if (blob) next[card.id] = blob
              else delete next[card.id]
              return next
            })
            setNotice(
              `${card.kind === 'sound' ? card.heard : card.meant} saved. ${card.kind === 'sound' ? 'Sound recognition is still a prototype.' : 'Your output uses the updated word rule.'}`
            )
            setEditor(null)
          }}
          onDelete={() => {
            setCards((old) => old.filter((item) => item.id !== editor.card.id))
            setAudio((old) => {
              const next = { ...old }
              delete next[editor.card.id]
              return next
            })
            setEditor(null)
            setNotice('Card removed from this browser.')
          }}
        />
      )}
      {resetting && (
        <dialog
          ref={resetDialog}
          className="vl-dialog vl-reset-dialog"
          aria-labelledby="reset-title"
          onCancel={(e) => {
            e.preventDefault()
            setResetting(false)
          }}
        >
          <h2 id="reset-title">Start fresh?</h2>
          <p>
            This replaces your prototype cards and model preferences with the examples, and clears
            this tab’s audio. Your desktop app is unaffected.
          </p>
          <div className="vl-dialog-actions">
            <button className="vl-secondary" onClick={() => setResetting(false)}>
              Keep my changes
            </button>
            <button
              className="vl-primary"
              onClick={() => {
                setPage('voice')
                setLabRevision((value) => value + 1)
                setCards(sampleCards)
                setModels(defaultModels)
                setAudio({})
                setLastTake(undefined)
                setResetting(false)
                setNotice('Demo reset to the starting examples.')
              }}
            >
              Reset demo
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<VoiceLab />)
