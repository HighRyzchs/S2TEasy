import { useEffect, useRef, useState } from 'react'
import { CUE_LABELS, cueExport, type SpeechCueSettings } from '@shared/speech-cues'
import type { HistoryItem } from '@shared/types'
import './speech-cues.css'

export function SpeechCuePanel({
  item,
  settings,
  text,
  active,
  position,
  onHistory,
  onConfigure
}: {
  item: HistoryItem
  settings: SpeechCueSettings
  text: string
  active: boolean
  position: number
  onHistory: (history: HistoryItem[]) => void
  onConfigure: () => void
}) {
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState(String(Math.min(30, item.durationMs / 1000 || 30)))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true),
    pending = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (pending.current) void window.s2t.cancelSpeechCues(item.id).catch(() => undefined)
    }
  }, [item.id])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error ? e.message : 'Cue action failed.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const result = item.cueAnalysis
  const validRange =
    Number.isFinite(Number(start)) &&
    Number.isFinite(Number(end)) &&
    start.trim() !== '' &&
    end.trim() !== '' &&
    Number(start) >= 0 &&
    Number(end) > Number(start) &&
    Number(end) - Number(start) <= 30
  return (
    <section className="speech-cue-panel" aria-labelledby="speech-cue-title">
      <div className="cue-heading">
        <div>
          <span className="eyebrow">VOICE INTELLIGENCE · EXPERIMENTAL</span>
          <h3 id="speech-cue-title">How it sounded</h3>
        </div>
        <button className="text-button" onClick={onConfigure}>
          Configure cues →
        </button>
      </div>
      <p className="hint">
        Emotion, delivery and pacing from the audio itself. Interpretations can be wrong. Plain text
        stays unchanged; choose when to share richer context.
      </p>
      {!settings.enabled ? (
        <p className="notice">
          Speech cues are off. Enable them in Voice intelligence to request audio analysis.
        </p>
      ) : !item.hasAudio ? (
        <p className="notice">
          This take has no retained audio. For a new example, use Voice practice or enable
          successful-take retention before recording. Old text cannot recover vocal emotion.
        </p>
      ) : (
        <>
          <div className="cue-range">
            <label>
              Excerpt start (seconds)
              <input
                type="number"
                min="0"
                step="0.1"
                value={start}
                disabled={busy || active}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Excerpt end (seconds)
              <input
                type="number"
                min="0"
                step="0.1"
                value={end}
                disabled={busy || active}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <button
              className="ghost"
              disabled={busy || active}
              onClick={() => {
                const s = Math.floor(position / 100) / 10
                setStart(String(s))
                setEnd(String(Math.min(s + 30, Math.max(s + 0.5, item.durationMs / 1000))))
              }}
            >
              Use playback position
            </button>
          </div>
          <p className="hint">
            Up to 30 seconds per request. Sends only this excerpt and your configured style guidance
            to OpenRouter; additional audio-model charges apply. One request, no automatic retry.
            Previous results are replaced only after a successful analysis.
          </p>
          <div className="inline">
            <button
              className="primary"
              disabled={busy || active || !validRange}
              onClick={() =>
                void run(async () => {
                  pending.current = true
                  try {
                    const history = await window.s2t.analyzeSpeechCues(item.id, {
                      startMs: Math.round(Number(start) * 1000),
                      endMs: Math.round(Number(end) * 1000)
                    })
                    if (alive.current) {
                      onHistory(history)
                      setMessage('Audio analysis saved. Review cues before sharing.')
                    }
                  } finally {
                    pending.current = false
                  }
                })
              }
            >
              {busy
                ? 'Working…'
                : result
                  ? 'Analyze excerpt again · paid call'
                  : 'Analyze excerpt · paid call'}
            </button>
            {busy && pending.current && (
              <button
                className="ghost"
                onClick={() =>
                  void window.s2t.cancelSpeechCues(item.id).catch((e) => setMessage(String(e)))
                }
              >
                Cancel analysis
              </button>
            )}
          </div>
        </>
      )}
      {result && (
        <div className="cue-result">
          <p className="micro">
            {result.model} · {(result.startMs / 1000).toFixed(1)}–{(result.endMs / 1000).toFixed(1)}
            s · audio {result.quality}
          </p>
          <p>{result.summary}</p>
          <p className="hint">
            Local measurement: {result.observations.quietIntervals.length} quiet{' '}
            {result.observations.quietIntervals.length === 1 ? 'interval' : 'intervals'} of at least
            300 ms; {(result.observations.clippedFraction * 100).toFixed(1)}% clipped samples. Quiet
            intervals use volume only, not speech or emotion recognition.
          </p>
          {!result.cues.length && (
            <p className="notice">
              No cues matched your settings, or the model abstained. No emotion is assumed.
            </p>
          )}
          {result.cues.map((cue) => (
            <article className={`cue-card ${cue.dismissed ? 'cue-dismissed' : ''}`} key={cue.id}>
              <div className="cue-heading">
                <strong>
                  {cue.kind} · {cue.userLabel ?? cue.label}
                </strong>
                <span className="micro">
                  {(cue.startMs / 1000).toFixed(1)}–{(cue.endMs / 1000).toFixed(1)}s
                </span>
              </div>
              <p className="hint">
                Model: {cue.label} · {cue.strength} assessment, uncalibrated
              </p>
              <p>{cue.evidence}</p>
              <div className="cue-edit">
                <label>
                  What did you mean?
                  <select
                    value={cue.userLabel ?? ''}
                    disabled={busy || active || cue.dismissed}
                    onChange={(e) => {
                      void run(async () =>
                        onHistory(
                          await window.s2t.cueFeedback(item.id, result.id, {
                            cueId: cue.id,
                            label: e.target.value || null
                          })
                        )
                      )
                    }}
                  >
                    <option value="">Keep model suggestion</option>
                    {CUE_LABELS[cue.kind].map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="ghost"
                  disabled={busy || active}
                  onClick={() =>
                    void run(async () =>
                      onHistory(
                        await window.s2t.cueFeedback(item.id, result.id, {
                          cueId: cue.id,
                          dismissed: !cue.dismissed
                        })
                      )
                    )
                  }
                >
                  {cue.dismissed ? 'Restore cue' : 'Dismiss cue'}
                </button>
              </div>
              {cue.userLabel && (
                <p className="micro">
                  Your label is saved separately. Original model suggestion is preserved.
                </p>
              )}
            </article>
          ))}
          <p className="hint">
            Corrections apply to this take. Use speaking-style guidance in Settings for future
            requests; the app does not retrain an emotion model. Cue timestamps are model estimates,
            not word alignment.
          </p>
          <div className="cue-actions">
            <button
              className="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await window.s2t.copyHistory(cueExport(text, result, false))
                  setMessage('Expressive text copied.')
                })
              }
            >
              Copy expressive text
            </button>
            <button
              className="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await window.s2t.copyHistory(cueExport(text, result, true))
                  setMessage('Structured context copied.')
                })
              }
            >
              Copy structured context
            </button>
            <button
              className="text-button"
              disabled={busy || active}
              onClick={() =>
                void run(async () => onHistory(await window.s2t.clearSpeechCues(item.id)))
              }
            >
              Delete analysis
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  )
}
