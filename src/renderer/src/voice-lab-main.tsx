import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { applyVocabulary } from '@shared/vocabulary'
import { VoiceLabRecorder } from './VoiceLabRecorder'
import {
  defaultModels,
  LAB_STORAGE,
  readLabDraft,
  sampleCalls,
  sampleCards,
  textRules,
  validModelSlug,
  type BillingClass,
  type LabModels,
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
function VoiceOrb() {
  return (
    <div className="vl-orbit" aria-hidden="true">
      <span className="vl-orbit-tag tag-one">Siobhán ✓</span>
      <span className="vl-orbit-tag tag-two">my little hum ♫</span>
      <div className="vl-orb">
        <div className="vl-orb-bars">
          {[16, 29, 44, 62, 39, 54, 26, 13].map((height, i) => (
            <i key={i} style={{ height, animationDelay: `${i * -0.22}s` }} />
          ))}
        </div>
        <span>one of a kind</span>
      </div>
      <span className="vl-orbit-star">✳</span>
    </div>
  )
}
function EntryEditor({
  card,
  initialAudio,
  existing,
  cards,
  onClose,
  onSave,
  onDelete
}: {
  card: VoiceCard
  initialAudio?: Blob
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
  const [recording, setRecording] = useState(false)
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
          if (recording) return
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
            Sound cues are a design experiment. You can label and record a sound here; automatic
            sound recognition still needs to be built.
          </p>
        )}
        <VoiceLabRecorder blob={blob} onChange={setBlob} onBusyChange={setRecording} />
        {!isSound && (
          <label className="vl-check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Use this correction in the text playground
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
          <button className="vl-primary" disabled={recording}>
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
function Models({ models, onSave }: { models: LabModels; onSave: (models: LabModels) => void }) {
  const [draft, setDraft] = useState(models)
  const [message, setMessage] = useState('')
  return (
    <section className="vl-models">
      <div className="vl-page-title">
        <span className="vl-overline">THE HELP BEHIND YOUR VOICE</span>
        <h1>Your models. In plain sight.</h1>
        <p>Two different jobs. Two clearly editable model IDs.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!validModelSlug(draft.speech.trim()) || !validModelSlug(draft.cues.trim())) {
            setMessage('Use a model ID like provider/model-name in both fields.')
            return
          }
          onSave({ speech: draft.speech.trim(), cues: draft.cues.trim() })
          setMessage('Saved in this browser prototype. Your desktop settings have not changed.')
        }}
      >
        <div className="vl-model-grid">
          {(
            [
              {
                key: 'speech',
                title: 'Speech → text',
                icon: 'Aa',
                description: 'The model that writes down what you say.',
                hint: 'Desktop: Settings → Speech engine → Audio model slug',
                tint: 'mint'
              },
              {
                key: 'cues',
                title: 'Emotion & delivery',
                icon: '✳',
                description: 'Optional audio understanding for tone, pacing and cues.',
                hint: 'Desktop: Settings → Voice intelligence → Audio understanding model',
                tint: 'peach'
              }
            ] as const
          ).map((item) => (
            <article className={`vl-model-card ${item.tint}`} key={item.key}>
              <span className="vl-card-symbol">{item.icon}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <label className="vl-field">
                OpenRouter model ID / slug
                <input
                  value={draft[item.key]}
                  onChange={(e) => setDraft({ ...draft, [item.key]: e.target.value })}
                  maxLength={160}
                  required
                  spellCheck={false}
                />
              </label>
              <small>{item.hint}</small>
            </article>
          ))}
        </div>
        <p className="vl-note">
          No API key is needed here. These fields save a design preference locally; the prototype
          makes no model calls and does not check model availability. In the app, audio support and
          provider compatibility still matter.
        </p>
        <div className="vl-model-actions">
          <button className="vl-primary">
            Save model preferences <Arrow />
          </button>
          <button
            type="button"
            className="vl-secondary"
            onClick={() => {
              setDraft(defaultModels)
              setMessage('Default model IDs restored in the form. Save to keep them.')
            }}
          >
            Use defaults
          </button>
        </div>
        <p role="status" className="vl-muted">
          {message}
        </p>
      </form>
      <div className="vl-future">
        <span>
          <Arrow />
        </span>
        <div>
          <strong>Later: a personal correction assistant</strong>
          <p>
            A small text-only pass could suggest your saved words in context. It should be optional,
            preserve meaning, and have its own cost category. This is planned, not running here.
          </p>
        </div>
      </div>
    </section>
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
  const [page, setPage] = useState<'voice' | 'models' | 'usage'>('voice')
  const [filter, setFilter] = useState<'all' | VoiceKind>('all')
  const [query, setQuery] = useState('')
  const [text, setText] = useState('Hey shiv on, let’s try s two t easy.\non my way shortcut')
  const [editor, setEditor] = useState<{ card: VoiceCard; existing: boolean } | null>(null)
  const [audio, setAudio] = useState<Record<string, Blob>>({})
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState('')
  const [resetting, setResetting] = useState(false)
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
    if (resetting) resetDialog.current?.showModal()
  }, [resetting])
  const visible = cards.filter(
    (card) =>
      (filter === 'all' || card.kind === filter) &&
      `${card.heard} ${card.meant}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  const output = useMemo(() => applyVocabulary(text, textRules(cards)), [text, cards])
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
                { id: 'models', icon: '◈', label: 'Models & settings' },
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
          {page === 'voice' ? (
            <>
              <section className="vl-hero">
                <div>
                  <span className="vl-overline">YOUR WORDS. YOUR ACCENT. YOUR WAY.</span>
                  <h1>
                    Sounds like <span>you.</span>
                  </h1>
                  <p>
                    Names it never gets right. Your favorite phrases.
                    <br className="vl-desktop-break" /> Even that little sound only you make.
                    <br className="vl-desktop-break" /> Give them all a home.
                  </p>
                  <button className="vl-primary" onClick={() => add()}>
                    ＋ Add something that’s you
                  </button>
                  <span className="vl-hero-caption">
                    One place for vocabulary & voice practice.
                  </span>
                </div>
                <VoiceOrb />
              </section>
              <div className="vl-steps">
                <div>
                  <span>1</span>
                  <p>
                    <strong>Add your word</strong>
                    <small>Or a phrase. Or a little sound.</small>
                  </p>
                </div>
                <span className="vl-step-arrow">→</span>
                <div>
                  <span>2</span>
                  <p>
                    <strong>Say it your way</strong>
                    <small>Record an optional example.</small>
                  </p>
                </div>
                <span className="vl-step-arrow">→</span>
                <div>
                  <span>3</span>
                  <p>
                    <strong>Make it feel right</strong>
                    <small>Try a text rule. Tweak any time.</small>
                  </p>
                </div>
              </div>
              <div className="vl-content-grid">
                <section className="vl-library">
                  <div className="vl-section-title">
                    <div>
                      <h2>
                        Your voice, collected<span>.</span>
                      </h2>
                      <p>A little library of the things that make you, you.</p>
                    </div>
                    <span className="vl-count">{cards.length} little things</span>
                  </div>
                  <div className="vl-filter-row" aria-label="Voice library filters">
                    {([{ id: 'all', label: 'Everything' }, ...kinds] as const).map((kind) => (
                      <button
                        key={kind.id}
                        className={filter === kind.id ? 'selected' : ''}
                        aria-pressed={filter === kind.id}
                        onClick={() => setFilter(kind.id)}
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                  <label className="vl-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a word, phrase or sound…"
                      aria-label="Search your voice library"
                    />
                  </label>
                  <div className="vl-card-grid">
                    {visible.map((card) => (
                      <button
                        key={card.id}
                        className={`vl-voice-card ${card.kind}`}
                        onClick={() => setEditor({ card, existing: true })}
                      >
                        <div className="vl-card-top">
                          <span className="vl-card-symbol">
                            {kinds.find((kind) => kind.id === card.kind)!.icon}
                          </span>
                          <span className="vl-card-type">
                            {card.sample ? 'EXAMPLE · ' : ''}
                            {card.kind === 'sound'
                              ? 'SOUND CUE'
                              : card.kind === 'phrase'
                                ? 'PHRASE'
                                : 'WORD / NAME'}
                          </span>
                          <span className="vl-card-edit">
                            <Arrow />
                          </span>
                        </div>
                        <h3>{card.kind === 'sound' ? card.heard : card.meant}</h3>
                        <p>
                          {card.kind === 'sound'
                            ? `Means “${card.meant}”`
                            : `Instead of “${card.heard}”`}
                        </p>
                        <div className="vl-card-bottom">
                          <span>
                            <i
                              className={
                                card.kind === 'sound' ? 'planned' : card.enabled ? '' : 'paused'
                              }
                            />
                            {card.kind === 'sound'
                              ? 'Recognition planned'
                              : card.enabled
                                ? 'Text rule on'
                                : 'Text rule paused'}
                          </span>
                          <span>{audio[card.id] ? '♫ Your take' : '＋ Try your voice'}</span>
                        </div>
                      </button>
                    ))}
                    <button
                      className="vl-add-card"
                      onClick={() => add(filter === 'all' ? 'word' : filter)}
                    >
                      <span>＋</span>
                      <strong>Something missing?</strong>
                      <small>Add a little more you.</small>
                    </button>
                  </div>
                  {visible.length === 0 && (
                    <p className="vl-muted">
                      {cards.length
                        ? 'Nothing here yet. Try another filter or add your own.'
                        : 'Your library is ready for its first word.'}
                    </p>
                  )}
                  <p className="vl-library-foot">
                    ✧ Examples are starting points. Edit them, replace them, make them yours.
                  </p>
                </section>
                <aside className="vl-playground">
                  <span className="vl-overline">THE LITTLE TRY-IT CORNER</span>
                  <h2>See the difference.</h2>
                  <p>Type the words it mishears. Watch your saved text rules tidy them up.</p>
                  <label className="vl-field">
                    What it heard
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <div className="vl-play-arrow">
                    ↓ <span>Your enabled text rules</span>
                  </div>
                  <div className="vl-output">
                    <span>WHAT YOU MEANT</span>
                    <p data-testid="corrected-text">
                      {output || 'Your corrected words will appear here.'}
                    </p>
                  </div>
                  <p className="vl-fine">
                    A real text-rule preview. No microphone transcription or AI call. Sound cards
                    are kept separate.
                  </p>
                  <div className="vl-sound-invite">
                    <span>♫</span>
                    <strong>Have a sound of your own?</strong>
                    <p>
                      A happy hum. A tiny click. Start by giving it a name and an optional
                      recording.
                    </p>
                    <button className="vl-text-button" onClick={() => add('sound')}>
                      Explore a sound cue <Arrow />
                    </button>
                  </div>
                </aside>
              </div>
              <section className="vl-honesty">
                <span>♡</span>
                <div>
                  <strong>Your accent belongs here.</strong>
                  <p>
                    Practice is about helping the app understand you. Saved examples don’t retrain a
                    speech model yet; text rules are exact corrections you control.
                  </p>
                </div>
                <button className="vl-text-button" onClick={() => setPage('models')}>
                  Meet your models <Arrow />
                </button>
              </section>
            </>
          ) : page === 'models' ? (
            <Models models={models} onSave={setModels} />
          ) : (
            <Usage />
          )}
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
              `${card.kind === 'sound' ? card.heard : card.meant} saved. ${card.kind === 'sound' ? 'Sound recognition is still a prototype.' : 'Try its text rule in the playground.'}`
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
                setCards(sampleCards)
                setModels(defaultModels)
                setAudio({})
                setQuery('')
                setFilter('all')
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
