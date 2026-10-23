import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, HistoryItem, OverlayState } from '@shared/types'
import { renderOutput } from '@shared/output'
import { practiceProgress } from '@shared/practice-progress'
import { OutputChoices } from './OutputChoices'
import { CueSettingsPanel } from './CueSettingsPanel'
import { SpeechCuePanel } from './SpeechCuePanel'
import './your-voice.css'

export function YourVoicePanel({
  settings,
  history,
  overlay,
  initialTarget = '',
  onSave,
  onOutput,
  onHistory,
  onReview
}: {
  settings: AppSettings
  history: HistoryItem[]
  overlay: OverlayState
  initialTarget?: string
  onSave: (patch: Partial<AppSettings>) => Promise<void>
  onOutput: (value: AppSettings['output']) => Promise<void>
  onHistory: (history: HistoryItem[]) => void
  onReview: (id: string) => void
}) {
  const [target, setTarget] = useState(initialTarget)
  const [consent, setConsent] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [heard, setHeard] = useState('')
  const [meant, setMeant] = useState('')
  const [filter, setFilter] = useState<'all' | 'words' | 'takes'>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState<'plain' | 'tags' | 'json'>('tags')
  const [position, setPosition] = useState(0)
  useEffect(() => setTarget(initialTarget), [initialTarget])
  useEffect(() => {
    if (overlay.mode === 'practice' && overlay.sessionId) {
      setSelected(overlay.sessionId)
      setPosition(0)
    }
  }, [overlay.mode, overlay.sessionId])
  const active = ['listening', 'transcribing', 'inserting'].includes(overlay.status)
  const ownRecording = active && overlay.mode === 'practice'
  const item = history.find((row) => row.id === selected) ?? history[0]
  const outputItem =
    active && overlay.partial ? { text: overlay.partial, cueAnalysis: overlay.cueAnalysis } : item
  const output = outputItem ? renderOutput(outputItem, settings.output, format) : ''
  const progress = useMemo(() => practiceProgress(history), [history])
  const words = settings.vocabulary.filter((row) =>
    `${row.heard} ${row.meant}`.toLowerCase().includes(query.toLowerCase())
  )
  const takes = history.filter(
    (row) =>
      row.source === 'practice' &&
      `${row.practiceTarget ?? ''} ${row.rawText ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not complete that action.')
    } finally {
      setBusy(false)
    }
  }
  const copy = (mode: 'plain' | 'tags' | 'json') =>
    void run(async () => {
      const id = active ? overlay.sessionId : item?.id
      if (!id) return
      const ok = await window.s2t.copyOutput(id, mode)
      if (!ok) throw new Error('Clipboard is busy. Try again.')
      setMessage(
        mode === 'plain'
          ? 'Copied words with your corrections.'
          : 'Copied saved voice cues with your words.'
      )
    })
  return (
    <div className="your-voice">
      <div className="panel-head">
        <div>
          <span className="eyebrow">WORDS + SOUNDS + EXPRESSION</span>
          <h2>Your voice. Your output.</h2>
          <p>One place to shape what comes out when you speak.</p>
        </div>
        <span className="subtle-tag">Personal, by design</span>
      </div>
      <section className="voice-output block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / MAKE IT YOURS</span>
            <h3>What should your output look like?</h3>
          </div>
          <span className="voice-kept">✓ Word corrections always stay</span>
        </div>
        <OutputChoices
          value={settings.output}
          disabled={busy}
          onChange={(value) =>
            void run(async () => {
              await onOutput(value)
            })
          }
        />
        <div className="voice-output-toolbar">
          <div className="picks" role="group" aria-label="Preview format">
            {(['tags', 'plain', 'json'] as const).map((mode) => (
              <button key={mode} aria-pressed={format === mode} onClick={() => setFormat(mode)}>
                {mode === 'tags' ? 'With voice tags' : mode === 'plain' ? 'Words only' : 'JSON'}
              </button>
            ))}
          </div>
          <label>
            Take{' '}
            <select
              aria-label="Preview take"
              value={item?.id ?? ''}
              disabled={active}
              onChange={(e) => {
                setSelected(e.target.value)
                setPosition(0)
              }}
            >
              <option value="" disabled>
                No takes yet
              </option>
              {history.map((row) => (
                <option key={row.id} value={row.id}>
                  {new Date(row.createdAt).toLocaleDateString()} ·{' '}
                  {(row.practiceTarget || row.text || 'Unfinished take').slice(0, 55)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className={`voice-result ${format === 'json' ? 'json' : ''}`}
          aria-label="Your voice output"
          aria-live="polite"
        >
          {output ||
            'Your next thought goes here. Record a take below, or dictate with your shortcut.'}
        </div>
        <div className="inline voice-copy-actions">
          <button className="primary" disabled={busy || !output} onClick={() => copy('tags')}>
            Copy with tags
          </button>
          <button className="ghost" disabled={busy || !output} onClick={() => copy('plain')}>
            Copy words
          </button>
          <button className="text-button" disabled={busy || !output} onClick={() => copy('json')}>
            Copy JSON
          </button>
          {item && (
            <button className="text-button" onClick={() => onReview(item.id)}>
              Edit words & labels ↗
            </button>
          )}
        </div>
        <p className="micro">
          {outputItem?.cueAnalysis
            ? 'Tags describe the analyzed audio range; they are interpretations you can correct.'
            : 'No saved audio cues on this take yet. Copy with tags keeps the words and adds cues only when available.'}{' '}
          Copy choices also live on the recording HUD. Automatic insertion remains words only.
        </p>
        {item?.cueError && (
          <p role="status" className="notice">
            {item.cueError} Your words were saved.
          </p>
        )}
      </section>
      <section className="block voice-record">
        {overlay.status === 'error' && (
          <p className="status-bad" role="alert">
            {overlay.message}
          </p>
        )}
        <div>
          <span className="eyebrow">02 / TRY IT IN YOUR OWN VOICE</span>
          <h3>A tiny take. A useful reference.</h3>
          <p className="hint">
            Say a name, a tricky word, or a short phrase in your usual tone. Listen back and correct
            it here.
          </p>
        </div>
        <div className="field">
          <label htmlFor="your-voice-target">What will you say?</label>
          <input
            id="your-voice-target"
            maxLength={200}
            disabled={active}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="A name, a phrase, or something you say your way…"
          />
        </div>
        <div className="picks">
          {settings.vocabulary
            .filter((row) => row.enabled)
            .slice(0, 6)
            .map((row) => (
              <button key={row.id} disabled={active} onClick={() => setTarget(row.meant)}>
                {row.meant}
              </button>
            ))}
        </div>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={active}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Keep this labeled take on my device for {settings.audioRetentionDays} days. My speech
            provider receives audio for recognition; enabled automatic cues add one audio-model
            call.
          </span>
        </label>
        <div className="voice-record-actions">
          <span className={`voice-mic ${ownRecording ? 'recording' : ''}`} aria-hidden="true">
            ≋
          </span>
          <div>
            <strong>{ownRecording ? overlay.message : 'Sound like yourself.'}</strong>
            <p className="hint">
              {ownRecording
                ? overlay.partial || 'Listening…'
                : 'Examples build a dataset you own. They do not retrain a model.'}
            </p>
          </div>
          <button
            className="primary"
            disabled={
              busy || (active && !ownRecording) || (!active && (!target.trim() || !consent))
            }
            onClick={() =>
              void run(() =>
                ownRecording ? window.s2t.stopRecording() : window.s2t.startPractice(target)
              )
            }
          >
            {ownRecording ? 'Finish take' : 'Record a take'}
          </button>
          {ownRecording && (
            <button className="ghost" onClick={() => void run(() => window.s2t.cancelRecording())}>
              Cancel
            </button>
          )}
        </div>
        {active && !ownRecording && (
          <p className="notice">Finish the current dictation before making a practice take.</p>
        )}
      </section>
      <section className="block voice-rule-form">
        <span className="eyebrow">03 / LITTLE CORRECTIONS, LESS FRICTION</span>
        <h3>When it hears this, write that.</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              if (
                settings.vocabulary.some(
                  (row) =>
                    row.id !== editingRule && row.heard.toLowerCase() === heard.trim().toLowerCase()
                )
              )
                throw new Error('That phrase already has a rule. Update it in your library below.')
              await onSave({
                vocabulary: editingRule
                  ? settings.vocabulary.map((row) =>
                      row.id === editingRule
                        ? { ...row, heard: heard.trim(), meant: meant.trim() }
                        : row
                    )
                  : [
                      ...settings.vocabulary,
                      {
                        id: crypto.randomUUID(),
                        heard: heard.trim(),
                        meant: meant.trim(),
                        enabled: true
                      }
                    ]
              })
              setHeard('')
              setMeant('')
              setEditingRule(null)
              setMessage('Remembered. This correction stays in plain and tagged output.')
            })
          }}
        >
          <div className="rule-form">
            <div className="field">
              <label htmlFor="voice-heard">What it heard</label>
              <input
                id="voice-heard"
                required
                maxLength={120}
                value={heard}
                onChange={(e) => setHeard(e.target.value)}
                placeholder="The spelling it gets wrong"
              />
            </div>
            <span aria-hidden="true">→</span>
            <div className="field">
              <label htmlFor="voice-meant">What you meant</label>
              <input
                id="voice-meant"
                required
                maxLength={120}
                value={meant}
                onChange={(e) => setMeant(e.target.value)}
                placeholder={settings.displayName || 'The words you wanted'}
              />
            </div>
            <button
              className="primary"
              disabled={
                busy ||
                active ||
                (settings.vocabulary.length >= 500 && !editingRule) ||
                !heard.trim() ||
                !meant.trim()
              }
            >
              {editingRule ? 'Save correction' : 'Remember word'}
            </button>
          </div>
        </form>
        {editingRule && (
          <button
            className="text-button"
            onClick={() => {
              setEditingRule(null)
              setHeard('')
              setMeant('')
            }}
          >
            Cancel edit
          </button>
        )}
        <p className="micro">
          These explicit rules apply to future finalized words and fix recurring recognition
          mistakes. A sound recording alone does not create a noise-to-word recognizer.
        </p>
      </section>
      <section className="voice-library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR PERSONAL LIBRARY</span>
            <h3>Everything that sounds like you.</h3>
          </div>
          <input
            className="search"
            aria-label="Search your voice library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a word or take…"
          />
        </div>
        <div className="picks" role="group" aria-label="Voice library filter">
          {(['all', 'words', 'takes'] as const).map((id) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {id === 'all'
                ? 'Everything'
                : id === 'words'
                  ? 'Word rules'
                  : 'Voice & expression takes'}
            </button>
          ))}
        </div>
        <div className="voice-library-grid">
          {filter !== 'takes' &&
            words.map((row) => (
              <article className="card voice-library-card" key={row.id}>
                <span className="eyebrow">Aa / WORD RULE</span>
                <h3>{row.meant}</h3>
                <p className="hint">
                  {row.heard} → {row.meant}
                </p>
                <div className="inline">
                  <button
                    className="text-button"
                    disabled={busy || active}
                    onClick={() => {
                      setEditingRule(row.id)
                      setHeard(row.heard)
                      setMeant(row.meant)
                      document.getElementById('voice-heard')?.focus()
                    }}
                  >
                    Edit rule
                  </button>
                  <button
                    className="ghost"
                    disabled={active}
                    onClick={() => {
                      setTarget(row.meant)
                      document.getElementById('your-voice-target')?.focus()
                    }}
                  >
                    Try saying it
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || active}
                    onClick={() =>
                      void run(() =>
                        onSave({
                          vocabulary: settings.vocabulary.map((entry) =>
                            entry.id === row.id ? { ...entry, enabled: !entry.enabled } : entry
                          )
                        })
                      )
                    }
                  >
                    {row.enabled ? 'Pause rule' : 'Resume rule'}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || active}
                    onClick={() =>
                      void run(() =>
                        onSave({
                          vocabulary: settings.vocabulary.filter((entry) => entry.id !== row.id)
                        })
                      )
                    }
                    aria-label={`Remove ${row.meant}`}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          {filter !== 'words' &&
            takes.map((take) => {
              const stats = progress.find(
                (row) => row.target === take.practiceTarget && row.model === take.model
              )
              return (
                <article className="card voice-library-card" key={take.id}>
                  <span className="eyebrow">
                    ≋ / {take.cueAnalysis ? 'EXPRESSION TAKE' : 'VOICE TAKE'}
                  </span>
                  <h3>{take.practiceTarget || take.text || 'Unfinished take'}</h3>
                  <p className="hint">Heard: {take.rawText || 'No finalized recognition'}</p>
                  <p className="micro">
                    {new Date(take.createdAt).toLocaleDateString()} ·{' '}
                    {take.hasAudio ? 'Audio on device' : 'Audio expired or unavailable'}
                    {stats ? ` · ${stats.matched}/${stats.scored} matched takes` : ''}
                  </p>
                  <button
                    className="ghost"
                    disabled={active}
                    onClick={() => {
                      setSelected(take.id)
                      setPosition(0)
                    }}
                  >
                    Use this take ↑
                  </button>{' '}
                  <button className="text-button" onClick={() => onReview(take.id)}>
                    Review & correct
                  </button>
                </article>
              )
            })}
        </div>
        {!words.length && !takes.length && (
          <p className="hint">Room for your first word. Add a correction or record a take above.</p>
        )}
      </section>
      {item && (
        <section className="block voice-listen">
          <span className="eyebrow">LISTEN + REFINE / SELECTED TAKE</span>
          <h3>{item.practiceTarget || 'How did it sound?'}</h3>
          {item.hasAudio && !active && (
            <audio
              key={item.id}
              controls
              preload="metadata"
              src={`s2t-audio://session/${encodeURIComponent(item.id)}`}
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
              onError={() =>
                setMessage('This audio is unavailable or has expired. The text is still saved.')
              }
            />
          )}
          <SpeechCuePanel
            key={item.id}
            item={item}
            settings={settings.speechCues}
            output={settings.output}
            text={item.text}
            active={active}
            position={position}
            onHistory={onHistory}
            onConfigure={() => {
              document
                .getElementById('voice-model-settings')
                ?.scrollIntoView({ behavior: 'smooth' })
              ;(document.getElementById('voice-model-settings') as HTMLDetailsElement).open = true
            }}
          />
        </section>
      )}
      <details className="block voice-model-settings" id="voice-model-settings">
        <summary>
          Audio intelligence & model settings <span>{settings.speechCues.model}</span>
        </summary>
        <CueSettingsPanel
          key={JSON.stringify(settings.speechCues) + settings.apiKey}
          settings={settings}
          onChange={onSave}
        />
      </details>
      {message && (
        <div className="notice voice-feedback" role="status">
          {message}
          <button
            className="text-button"
            aria-label="Dismiss voice message"
            onClick={() => setMessage('')}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
