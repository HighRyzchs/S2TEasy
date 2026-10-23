import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [ruleEditor, setRuleEditor] = useState(false)
  const editor = useRef<HTMLDialogElement>(null)
  const addWordButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (ruleEditor) {
      editor.current?.showModal()
      document.getElementById('voice-heard')?.focus()
    } else if (editor.current?.open) {
      editor.current.close()
      addWordButton.current?.focus()
    }
  }, [ruleEditor])
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
      <header className="voice-heading">
        <div>
          <span className="eyebrow">ONE SPACE. YOUR KIND OF SPEECH.</span>
          <h2>
            A little more <em>you.</em>
          </h2>
          <p>Your words, your sounds, your expression. Shape what comes out as you go.</p>
        </div>
        <div className="voice-heading-art" aria-hidden="true">
          <span>{settings.displayName || 'Your words'}</span>
          <span>[excited]</span>
          <span>♫</span>
        </div>
      </header>
      <div className="voice-studio">
        <section className="voice-output voice-surface">
          <div className="voice-card-head">
            <div>
              <span className="eyebrow">WHAT YOU’LL SEND</span>
              <h3>Make it sound like you.</h3>
            </div>
            <button className="primary" disabled={busy || !output} onClick={() => copy(format)}>
              Copy output ↗
            </button>
          </div>
          <div className="voice-output-toolbar">
            <div className="voice-format-tabs" role="group" aria-label="Preview format">
              {(['tags', 'plain', 'json'] as const).map((mode) => (
                <button key={mode} aria-pressed={format === mode} onClick={() => setFormat(mode)}>
                  {mode === 'tags' ? 'With expression' : mode === 'plain' ? 'Plain words' : 'JSON'}
                </button>
              ))}
            </div>
            <button
              className="text-button voice-paper-toggle"
              disabled={busy || active}
              onClick={() =>
                void run(() =>
                  onSave({ appearance: settings.appearance === 'light' ? 'dark' : 'light' })
                )
              }
            >
              {settings.appearance === 'light' ? '☾ Night view' : '☀ Paper view'}
            </button>
          </div>
          <OutputChoices
            value={settings.output}
            disabled={busy}
            onChange={(value) => void run(() => onOutput(value))}
          />
          <div className="voice-copy-actions">
            <button className="ghost" disabled={busy || !output} onClick={() => copy('plain')}>
              Copy words
            </button>
            <button className="primary" disabled={busy || !output} onClick={() => copy('tags')}>
              Copy with tags
            </button>
            <span>Word corrections always stay ✓</span>
          </div>
          <div
            className={`voice-result ${format === 'json' ? 'json' : ''}`}
            aria-label="Your voice output"
            aria-live="polite"
          >
            {output || (
              <span className="voice-empty-output">
                A name it finally gets right.
                <br />A thought that sounds like you.
                <br />
                <small>Your next take will appear here.</small>
              </span>
            )}
          </div>
          <div className="voice-output-status">
            <span>
              <i className={active ? 'active' : ''} />
              {active
                ? overlay.message
                : outputItem?.cueAnalysis
                  ? 'Saved audio delivery cues'
                  : 'Your words, safely saved'}
            </span>
            <span>✓ Your word rules stay applied</span>
          </div>
          <div className="voice-output-foot">
            <span>
              {item
                ? 'A little edit can make the next take better.'
                : 'Start with a word or phrase in the try-it corner.'}
            </span>
            {item && (
              <button className="text-button" onClick={() => onReview(item.id)}>
                Edit words & labels ↗
              </button>
            )}
          </div>
          <label className="voice-take-picker">
            Preview a saved take
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
          {item?.cueError && (
            <p role="status" className="notice">
              {item.cueError} Your words were saved.
            </p>
          )}
          <p className="voice-scope-note">
            {outputItem?.cueAnalysis
              ? 'Tags keep their audio ranges. Interpretations are yours to review.'
              : 'Saved cues appear when available. No labels are invented.'}{' '}
            Copy choices never start a paid call.
          </p>
        </section>
        <aside className="voice-record voice-surface" aria-label="Try your voice">
          <span className="eyebrow">SPEAK. SEE IT. MAKE IT YOURS.</span>
          <h3>One little try-it corner.</h3>
          <p className="hint">
            A name, a phrase, the way only you say it. Keep a take and refine it in the same space.
          </p>
          <div className="voice-record-pad">
            <label htmlFor="your-voice-target">Try saying it your way</label>
            <input
              id="your-voice-target"
              maxLength={200}
              disabled={active}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="A word or phrase you use often…"
            />
            <div
              className="voice-volume"
              aria-label={
                ownRecording && overlay.status === 'listening'
                  ? 'Microphone volume'
                  : 'Microphone idle'
              }
            >
              <span
                className={`voice-mic ${ownRecording && overlay.status === 'listening' ? 'recording' : ''}`}
                aria-hidden="true"
              >
                {ownRecording ? '≋' : '●'}
              </span>
              <div aria-hidden="true">
                {Array.from({ length: 28 }, (_, index) => (
                  <i
                    key={index}
                    style={{
                      height:
                        ownRecording && overlay.status === 'listening'
                          ? `${3 + Math.min(1, overlay.bars[index % Math.max(1, overlay.bars.length)] || overlay.rms * 4) * 22}px`
                          : '3px'
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="micro">
              {ownRecording
                ? overlay.message
                : 'One natural phrase is enough. No typing into other apps.'}
            </p>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={active}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Save this take’s audio here for {settings.audioRetentionDays} days. My speech
                provider receives audio; enabled automatic cues add one audio-model call.
              </span>
            </label>
            <button
              className="primary voice-record-button"
              disabled={
                busy ||
                (active && (!ownRecording || overlay.status !== 'listening')) ||
                (!active && (!target.trim() || !consent))
              }
              onClick={() =>
                void run(() =>
                  ownRecording ? window.s2t.stopRecording() : window.s2t.startPractice(target)
                )
              }
            >
              {ownRecording
                ? overlay.status === 'listening'
                  ? 'Finish this take'
                  : 'Finishing your take…'
                : 'Record a take'}
            </button>
            {ownRecording && (
              <button
                className="text-button"
                onClick={() => void run(() => window.s2t.cancelRecording())}
              >
                Cancel and keep saved words
              </button>
            )}
          </div>
          {settings.vocabulary.some((row) => row.enabled) && (
            <div className="voice-quick-words">
              <span>Something familiar?</span>
              <div className="picks">
                {settings.vocabulary
                  .filter((row) => row.enabled)
                  .slice(0, 4)
                  .map((row) => (
                    <button key={row.id} disabled={active} onClick={() => setTarget(row.meant)}>
                      {row.meant}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <div className="voice-record-note">
            <span aria-hidden="true">♡</span>
            <p>A voice reference you own. Listen back, correct a word, or label how it sounded.</p>
          </div>
          <p className="micro">
            Examples don’t retrain a model. Optional audio interpretation stays under your control.
          </p>
          {active && !ownRecording && (
            <p className="notice">Finish your dictation before making a practice take.</p>
          )}
          {overlay.status === 'error' && (
            <p className="status-bad" role="alert">
              {overlay.message}
            </p>
          )}
        </aside>
      </div>
      <section className="voice-library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR PERSONAL LIBRARY</span>
            <h3>Everything that sounds like you.</h3>
          </div>
          <div className="voice-library-tools">
            <button
              ref={addWordButton}
              className="primary"
              disabled={busy || active}
              onClick={() => {
                setEditingRule(null)
                setHeard('')
                setMeant('')
                setRuleEditor(true)
              }}
            >
              + Add a word
            </button>
            <input
              className="search"
              aria-label="Search your voice library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a word or take…"
            />
          </div>
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
                <span className="voice-card-symbol word" aria-hidden="true">
                  Aa
                </span>
                <span className="eyebrow">PERSONAL WORD</span>
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
                      setRuleEditor(true)
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
                  <span className="voice-card-symbol take" aria-hidden="true">
                    ≋
                  </span>
                  <span className="eyebrow">
                    {take.cueAnalysis ? 'EXPRESSION TAKE' : 'VOICE TAKE'}
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
          <p className="hint">
            Your little library starts here. Add a word, or make a take in the try-it corner.
          </p>
        )}
      </section>
      {item && (
        <details className="voice-listen voice-surface">
          <summary>
            Listen & refine this take <span>Playback, emotion and delivery labels ↗</span>
          </summary>
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
        </details>
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

      <dialog
        ref={editor}
        className="voice-word-dialog"
        aria-labelledby="voice-word-title"
        onCancel={() => setRuleEditor(false)}
      >
        <div className="voice-card-head">
          <div>
            <span className="eyebrow">A LITTLE MORE LIKE YOU</span>
            <h3 id="voice-word-title">
              {editingRule ? 'Make this word yours.' : 'A word worth remembering.'}
            </h3>
          </div>
          <button
            className="ghost"
            aria-label="Close word editor"
            disabled={busy}
            onClick={() => setRuleEditor(false)}
          >
            ×
          </button>
        </div>
        <p className="hint">
          When it hears this, write that. A small correction that stays with you.
        </p>
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
              setRuleEditor(false)
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

        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </dialog>
      {message && !ruleEditor && (
        <div className="voice-feedback notice" role="status">
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
