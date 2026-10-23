import { useEffect, useState } from 'react'
import type { HistoryItem } from '@shared/types'
import { useApp } from '../context'
import { Highlighted } from './Highlighted'
import {
  appName,
  countWords,
  formatDuration,
  formatWhen,
  isWorking,
  needsRecovery,
  plural
} from './format'

function metaLine(item: HistoryItem, retentionDays: number): string {
  const parts: string[] = []
  if (item.text.trim()) parts.push(plural(countWords(item.text), 'word'))
  parts.push(formatDuration(item.durationMs))
  parts.push(
    item.source === 'practice' ? 'practice' : item.source === 'final' ? 'draft first' : 'live typing'
  )
  if (item.cueAnalysis) parts.push('cues on')
  parts.push(
    item.hasAudio
      ? retentionDays > 0
        ? `audio kept ${plural(retentionDays, 'day')}`
        : 'audio kept'
      : 'no audio kept'
  )
  return parts.join(' · ')
}

export function SessionDetail({ item }: { item: HistoryItem }) {
  const { settings, run, toast, openReview, setHistory } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [remembered, setRemembered] = useState<string[]>([])
  useEffect(() => {
    setConfirmDelete(false)
    setRemembered([])
  }, [item.id])

  const working = isWorking(item)
  const failed = needsRecovery(item)
  const hasText = !!item.text.trim()
  const fixes = item.fixes ?? []
  const edits = item.edits ?? []
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    await run(action)
    setBusy(false)
  }
  const copy = (format: 'plain' | 'tags') =>
    act(async () => {
      if (format === 'tags') await window.s2t.copyOutput(item.id, 'tags')
      else await window.s2t.copyHistory(item.text)
      toast('Copied')
    })

  return (
    <section className="card detail" aria-label="Session details">
      <div className="detail-head">
        <div className="detail-title">
          <h2>
            {appName(item)} · {formatWhen(item.createdAt)}
          </h2>
          <span className="hint">{metaLine(item, settings.audioRetentionDays)}</span>
        </div>
        <div className="actions">
          <button type="button" className="btn" disabled={!hasText || busy} onClick={() => void copy('plain')}>
            Copy
          </button>
          {item.cueAnalysis && (
            <button type="button" className="btn" disabled={busy} onClick={() => void copy('tags')}>
              Copy with tags
            </button>
          )}
          {failed && item.hasAudio && (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setHistory(await window.s2t.recoverHistory(item.id))
                  toast('Recovered from the saved audio')
                })
              }
            >
              {busy ? 'Working…' : 'Recover words'}
            </button>
          )}
          <button
            type="button"
            className={failed && item.hasAudio ? 'btn' : 'btn primary'}
            disabled={!hasText || working || busy}
            onClick={() => void act(() => window.s2t.insertHistory(item.text))}
          >
            Type again
          </button>
          <button type="button" className="btn" disabled={working} onClick={() => openReview(item.id)}>
            Review &amp; edit
          </button>
        </div>
      </div>

      <div className="detail-text">
        {hasText ? (
          <p>
            <Highlighted item={item} text={item.text} />
          </p>
        ) : (
          <p className="dim">{working ? 'Listening for words…' : 'No words were saved for this session.'}</p>
        )}
        {item.error && <p className="detail-error">{item.error}</p>}
        {item.unconfirmedText && (
          <p className="dim detail-note">Unconfirmed final words: {item.unconfirmedText}</p>
        )}
        {item.source === 'practice' && (
          <p className="dim detail-note">
            Recognized: {item.rawText || 'Nothing was recognized. The clip can still be labeled.'}
          </p>
        )}
      </div>

      <div className="changes">
        <span className="label">What changed</span>
        {fixes.map((fix, i) => (
          <div className="change" key={`fix-${i}`}>
            <s className="mono faint">{fix.from}</s>
            <span aria-hidden="true">→</span>
            <b>{fix.to}</b>
            <span className="hint change-why">your word</span>
          </div>
        ))}
        {edits.map((edit, i) => {
          const key = `${edit.from}→${edit.to}`
          const done = remembered.includes(key)
          return (
            <div className="change" key={`edit-${i}`}>
              <s className="mono faint">{edit.from}</s>
              <span aria-hidden="true">→</span>
              <b>{edit.to}</b>
              <span className="hint change-why">
                fixed by hand
                <button
                  type="button"
                  className="btn small"
                  disabled={done}
                  onClick={() =>
                    void run(async () => {
                      await window.s2t.learnWord({ heard: edit.from, meant: edit.to, kind: 'name' })
                      setRemembered((r) => [...r, key])
                      toast(`Remembered “${edit.to}” in Your voice`)
                    })
                  }
                >
                  {done ? 'Remembered' : 'Remember'}
                </button>
              </span>
            </div>
          )
        })}
        {!fixes.length && !edits.length && (
          <span className="hint">Nothing was changed. These are the words exactly as heard.</span>
        )}
      </div>

      <div className="detail-foot">
        {item.hasAudio && (
          <button
            type="button"
            className="link"
            disabled={working || busy}
            onClick={() => void act(() => window.s2t.exportAudio(item.id))}
          >
            Export audio + labels
          </button>
        )}
        <span className="grow" />
        {confirmDelete ? (
          <span className="confirm" role="alert">
            <span>Delete this session{item.hasAudio ? ' and its audio' : ''}?</span>
            <button
              type="button"
              className="btn small danger"
              disabled={busy}
              onClick={() =>
                void act(async () => setHistory(await window.s2t.deleteHistory(item.id)))
              }
            >
              Delete
            </button>
            <button type="button" className="btn small" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="link danger"
            disabled={working || busy}
            onClick={() => setConfirmDelete(true)}
          >
            {item.hasAudio ? 'Delete session and audio' : 'Delete session'}
          </button>
        )}
      </div>
    </section>
  )
}
