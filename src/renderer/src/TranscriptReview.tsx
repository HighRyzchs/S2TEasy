import { useEffect, useRef, useState } from 'react'
import { suggestCorrections, type Correction } from '@shared/corrections'
import type { HistoryItem, AppSettings } from '@shared/types'
import { SpeechCuePanel } from './SpeechCuePanel'
import './review.css'
import { OutputChoices } from './OutputChoices'

export function TranscriptReview({
  item,
  onClose,
  onSave,
  onRemember,
  onPractice,
  onExample,
  settings,
  onHistory,
  onConfigureCues
}: {
  item: HistoryItem
  onClose: () => void
  onSave: (text: string) => Promise<void>
  onRemember: (heard: string, meant: string) => Promise<void>
  onPractice: (text: string) => void
  onExample: (index: number, intended: string) => Promise<void>
  settings: AppSettings
  onHistory: (history: HistoryItem[]) => void
  onConfigureCues: () => void
}) {
  const [text, setText] = useState(item.text)
  const [dirty, setDirty] = useState(false)
  const [suggestions, setSuggestions] = useState<Correction[]>([])
  const [remembered, setRemembered] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [intended, setIntended] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const active = item.status === 'recording' || item.status === 'processing'
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  useEffect(() => {
    if (!dirty) setText(item.text)
  }, [item.text, dirty])
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      if (audio.current) setPosition(audio.current.currentTime * 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the correction.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      className="review-dialog"
      ref={dialog}
      aria-labelledby="review-title"
      onCancel={onClose}
    >
      <div className="review-head">
        <div>
          <span className="label">Review and edit</span>
          <h2 id="review-title">Fix this session</h2>
          <p>Listen back, correct the text, and choose what to remember.</p>
        </div>
        <button className="btn icon" aria-label="Close transcript review" onClick={onClose}>
          ×
        </button>
      </div>
      <section className="review-block">
        <h3>Copy your way</h3>
        <OutputChoices
          value={settings.output}
          onChange={(value) =>
            void run(async () => {
              await window.s2t.saveOutput(value)
            })
          }
          disabled={busy}
        />
      </section>
      {active && (
        <p className="review-notice" role="status">
          Finishing this recording. You can read along; saving unlocks when it finishes.
        </p>
      )}
      {item.hasAudio && !active && (
        <section className="review-audio">
          <span className="label">Listen back · audio on this PC</span>
          <audio
            ref={audio}
            controls
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            preload="metadata"
            src={`s2t-audio://session/${encodeURIComponent(item.id)}`}
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
            onError={() =>
              setError('Audio could not be loaded. It may have expired or been removed.')
            }
          />
          {item.words?.length ? (
            <>
              <p className="hint">
                Words follow the provider’s timestamps. Select a word to seek and label a
                pronunciation example.
              </p>
              <div className="timed-words">
                {item.words.map((word, index) => (
                  <button
                    key={index}
                    className={`${position >= word.startMs && position < word.endMs ? 'speaking' : ''} ${selected === index ? 'selected' : ''}`}
                    onClick={() => {
                      setSelected(index)
                      setIntended(word.text)
                      if (audio.current) audio.current.currentTime = word.startMs / 1000
                    }}
                  >
                    {word.text}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">
              Word timestamps are unavailable for this take. Full playback is available. Enable word
              timings in Settings for compatible speech models.
            </p>
          )}
          {selected !== null && (
            <div className="word-label">
              <label className="field">
                Intended spelling
                <input
                  className="input"
                  value={intended}
                  maxLength={200}
                  onChange={(e) => setIntended(e.target.value)}
                />
              </label>
              <button
                className="btn"
                disabled={active || busy || !intended.trim()}
                onClick={() =>
                  void run(async () => {
                    await onExample(selected, intended)
                    setSelected(null)
                  })
                }
              >
                Keep labeled word clip
              </button>
              <p className="hint">
                Keeps a local practice clip with 150 ms of context, subject to your audio retention
                period. This does not fine-tune a model.
              </p>
            </div>
          )}
        </section>
      )}
      <label className="review-label field" htmlFor="review-text">
        Corrected transcript
      </label>
      <textarea
        id="review-text"
        className="input"
        rows={7}
        value={text}
        disabled={active}
        onChange={(e) => {
          setText(e.target.value)
          setDirty(true)
        }}
      />
      {item.unconfirmedText && (
        <div className="review-notice">
          <strong>Unconfirmed final words</strong>
          <p>{item.unconfirmedText}</p>
          <button
            className="btn"
            disabled={active}
            onClick={() => {
              setText((v) => `${v.trim()} ${item.unconfirmedText}`.trim())
              setDirty(true)
            }}
          >
            Include for review
          </button>
        </div>
      )}
      <div className="review-footer">
        <p className="hint">
          Saves to local History. Already inserted text in another app must be updated there.
        </p>
        <div className="actions">
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() =>
              void run(async () => {
                await window.s2t.copyHistory(text)
              })
            }
          >
            Copy text
          </button>
          <button
            className="btn primary"
            disabled={active || busy || !dirty}
            onClick={() =>
              void run(async () => {
                const changes = suggestCorrections(item.text, text)
                await onSave(text)
                setSuggestions(changes)
                setDirty(false)
              })
            }
          >
            {busy ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
      {!!suggestions.length && (
        <section className="remember-section">
          <span className="label">For next time</span>
          <h3>Remember these corrections?</h3>
          <p className="hint">
            Vocabulary replacements apply to future transcripts. Voice practice keeps examples you
            label; it does not automatically train the speech model.
          </p>
          {suggestions.map(({ heard, meant }) => (
            <div className="remember-card" key={`${heard}-${meant}`}>
              <div>
                <span className="heard">{heard}</span>
                <span aria-hidden="true"> → </span>
                <strong>{meant}</strong>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  disabled={busy || remembered.includes(heard)}
                  onClick={() =>
                    void run(async () => {
                      await onRemember(heard, meant)
                      setRemembered((v) => [...v, heard])
                    })
                  }
                >
                  {remembered.includes(heard) ? 'Remembered ✓' : 'Remember in Your voice'}
                </button>
                <button className="link" onClick={() => onPractice(meant)}>
                  Practice this
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      <SpeechCuePanel
        item={item}
        settings={settings.speechCues}
        output={settings.output}
        text={text}
        active={active}
        position={position}
        onHistory={onHistory}
        onConfigure={onConfigureCues}
      />
      {error && (
        <p role="alert" className="review-bad">
          {error}
        </p>
      )}
    </dialog>
  )
}
