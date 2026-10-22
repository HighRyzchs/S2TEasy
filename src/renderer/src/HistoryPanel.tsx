import { useMemo, useState } from 'react'
import type { HistoryItem } from '@shared/types'
import type { GroupedHistory } from './App'

export function HistoryPanel({
  grouped,
  onCopy,
  onInsert,
  onDelete,
  onClear,
  onEdit,
  onRecover,
  onExport,
  onAddWord
}: {
  grouped: GroupedHistory
  onCopy: (text: string) => void
  onInsert: (text: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  onEdit?: (id: string, text: string) => Promise<void>
  onRecover?: (id: string) => Promise<void>
  onExport?: (id: string) => void
  onAddWord?: (heard: string, meant: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const filtered = useMemo(
    () =>
      grouped
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.text.toLowerCase().includes(query.trim().toLowerCase())
          )
        }))
        .filter((group) => group.items.length),
    [grouped, query]
  )
  return (
    <>
      <div className="panel-head">
        <div>
          <span className="eyebrow">A place for every thought</span>
          <h2>Your words, kept.</h2>
          <p>Find, correct, and recover your dictations.</p>
        </div>
        <button className="ghost" disabled={!grouped.length} onClick={() => setConfirmClear(true)}>
          Clear history
        </button>
      </div>
      <div className="history-toolbar">
        <label className="search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            className="search"
            aria-label="Search transcripts"
            placeholder="Search your words…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="micro">
          {grouped.reduce((n, group) => n + group.items.length, 0)} sessions · stored locally
        </span>
      </div>
      {confirmClear && (
        <div className="notice" role="alert">
          <p>Delete all transcripts and retained audio? This cannot be undone.</p>
          <div className="inline">
            <button
              className="danger-btn"
              onClick={() => {
                setConfirmClear(false)
                onClear()
              }}
            >
              Delete all
            </button>
            <button className="ghost" onClick={() => setConfirmClear(false)}>
              Keep history
            </button>
          </div>
        </div>
      )}
      {!filtered.length ? (
        <div className="empty">
          <div className="empty-glyph" aria-hidden="true">
            ≋
          </div>
          <strong>{query ? 'No matching words' : 'Your next thought starts here'}</strong>
          <p>
            {query
              ? 'Try a different search.'
              : 'Focus a text field and use your shortcut to start. Finalized words are saved as you speak.'}
          </p>
        </div>
      ) : (
        <div className="feed">
          {filtered.map((group) => (
            <section key={group.label}>
              <div className="day">{group.label}</div>
              {group.items.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  onCopy={() => onCopy(item.text)}
                  onInsert={() => onInsert(item.text)}
                  onDelete={() => onDelete(item.id)}
                  onEdit={onEdit}
                  onRecover={onRecover}
                  onExport={onExport}
                  onAddWord={onAddWord}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function HistoryCard({
  item,
  onCopy,
  onInsert,
  onDelete,
  onEdit,
  onRecover,
  onExport,
  onAddWord
}: {
  item: HistoryItem
  onCopy: () => void
  onInsert: () => void
  onDelete: () => void
  onEdit?: (id: string, text: string) => Promise<void>
  onRecover?: (id: string) => Promise<void>
  onExport?: (id: string) => void
  onAddWord?: (heard: string, meant: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [heard, setHeard] = useState('')
  const [meant, setMeant] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const active = item.status === 'recording' || item.status === 'processing'
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete this action.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="card" data-status={item.status ?? 'complete'}>
      <div className="card-head">
        <span className="session-time">
          {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          <span> · {Math.round(item.durationMs / 1000)}s</span>
        </span>
        <span className={`session-badge ${item.status ?? 'complete'}`}>
          {item.status === 'recording'
            ? 'Recording · saved so far'
            : item.status === 'processing'
              ? 'Processing'
              : item.status === 'error' || item.status === 'interrupted'
                ? 'Needs attention'
                : item.status === 'cancelled'
                  ? 'Cancelled · saved'
                  : item.source === 'practice'
                    ? 'Practice · labeled audio'
                    : 'Saved'}
        </span>
      </div>
      {editing ? (
        <div className="transcript-editor">
          <label htmlFor={`edit-${item.id}`}>Corrected transcript</label>
          <textarea
            id={`edit-${item.id}`}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="inline">
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                void run(async () => {
                  await onEdit?.(item.id, text)
                  setEditing(false)
                })
              }
            >
              Save correction
            </button>
            <button className="ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <div className="correction-rule">
            <p>Keep getting a name or phrase wrong? Add an explicit vocabulary rule.</p>
            <div className="grid-2">
              <input
                aria-label="Heard phrase"
                placeholder="Heard: rosin"
                value={heard}
                onChange={(e) => setHeard(e.target.value)}
              />
              <input
                aria-label="Intended phrase"
                placeholder="Meant: Roshan"
                value={meant}
                onChange={(e) => setMeant(e.target.value)}
              />
            </div>
            <button
              className="ghost"
              disabled={busy || !heard.trim() || !meant.trim()}
              onClick={() =>
                void run(async () => {
                  await onAddWord?.(heard, meant)
                  setHeard('')
                  setMeant('')
                })
              }
            >
              Remember this correction
            </button>
          </div>
        </div>
      ) : (
        <p className={item.text ? '' : 'muted'}>
          {item.text ||
            (active
              ? 'Listening for finalized speech…'
              : 'No finalized text. Retained audio may still be recoverable.')}
        </p>
      )}
      {item.source === 'practice' && (
        <div className="practice-feedback">
          <span>Intended text is shown above.</span>
          <p>
            <strong>Recognized:</strong>{' '}
            {item.rawText || 'No finalized recognition. The retained clip can still be labeled.'}
          </p>
        </div>
      )}
      {item.error && <p className="session-error">{item.error}</p>}
      {error && (
        <p className="status-bad" role="alert">
          {error}
        </p>
      )}
      <div className="meta">
        <span className="model-tag">{item.model}</span>
        <div className="row-actions">
          <button disabled={!item.text} onClick={onCopy}>
            Copy
          </button>
          <button disabled={active || !item.text} onClick={onInsert}>
            Insert
          </button>
          <button
            disabled={active}
            onClick={() => {
              setText(item.text)
              setEditing(!editing)
            }}
          >
            Correct
          </button>
          {item.hasAudio && (
            <>
              <button
                disabled={active || busy}
                onClick={() =>
                  void run(async () => {
                    await onRecover?.(item.id)
                  })
                }
              >
                {busy ? 'Working…' : 'Recover audio'}
              </button>
              <button disabled={active || busy} onClick={() => onExport?.(item.id)}>
                Export WAV + text
              </button>
            </>
          )}
          <button disabled={active || busy} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div className="inline delete-confirm">
          <span>Delete this session and its audio?</span>
          <button className="danger-btn" onClick={onDelete}>
            Delete
          </button>
          <button className="ghost" onClick={() => setConfirmDelete(false)}>
            Keep
          </button>
        </div>
      )}
    </article>
  )
}
