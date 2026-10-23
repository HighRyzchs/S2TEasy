import { OutputChoices } from './OutputChoices'
import type { OutputPreferences } from '@shared/output'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EXPRESSION_LABELS,
  defaultExpressionOptions,
  personalizePhrases,
  renderExpressiveTranscript,
  selectedExpressionTags,
  type ExpressionKind,
  type ExpressionSegment
} from '@shared/expressive-transcript'
import {
  compareProsody,
  measureProsody,
  suppliedPace,
  type ProsodyMeasurement
} from '@shared/prosody'
import { VoiceLabRecorder } from './VoiceLabRecorder'
import { scenes, sampleSegments, type Scene } from './voice-workspace-data'
import {
  textRules,
  validModelSlug,
  type LabModels,
  type VoiceCard,
  type VoiceKind
} from './voice-lab-data'
import './voice-workspace.css'

type TagChoice = { kind: ExpressionKind; label: string }
type Reference = {
  id: string
  neutral: boolean
  choice: TagChoice
  measurement: ProsodyMeasurement
  blob: Blob
  text: string
}
const categoryNames: Record<ExpressionKind, string> = {
  emotion: 'Emotion',
  delivery: 'Voice & emphasis',
  pacing: 'Pacing',
  event: 'Nonverbal sounds'
}
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`
function LabelOptions() {
  return (
    <>
      {(Object.keys(EXPRESSION_LABELS) as ExpressionKind[]).map((kind) => (
        <optgroup key={kind} label={categoryNames[kind]}>
          {EXPRESSION_LABELS[kind].map((label) => (
            <option key={label} value={`${kind}:${label}`}>
              [{label}]
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
function choiceValue(choice: TagChoice) {
  return `${choice.kind}:${choice.label}`
}
function readChoice(value: string): TagChoice | null {
  const [kind, label] = value.split(':')
  return Object.hasOwn(EXPRESSION_LABELS, kind!) &&
    (EXPRESSION_LABELS[kind as ExpressionKind] as readonly string[]).includes(label!)
    ? { kind: kind as ExpressionKind, label: label! }
    : null
}

export function VoiceWorkspace({
  active,
  editorOpen,
  cards,
  audio,
  models,
  onModelsChange,
  onAdd,
  onEdit,
  onTeachWord,
  onTakeChange,
  onNotice
}: {
  active: boolean
  editorOpen: boolean
  cards: VoiceCard[]
  audio: Record<string, Blob>
  models: LabModels
  onModelsChange: (models: LabModels) => void
  onAdd: (kind: VoiceKind) => void
  onEdit: (card: VoiceCard) => void
  onTeachWord: (word: string) => void
  onTakeChange: (blob: Blob | undefined) => void
  onNotice: (message: string) => void
}) {
  const [source, setSource] = useState<'example' | 'mine'>('example')
  const [scene, setScene] = useState<Scene>('shifting')
  const [segments, setSegments] = useState(() => sampleSegments('shifting'))
  const [words, setWords] = useState('')
  const [placement, setPlacement] = useState<OutputPreferences['placement']>('before')
  const [options, setOptions] = useState(() => ({ ...defaultExpressionOptions(), enabled: true }))
  const [format, setFormat] = useState<'inline' | 'plain' | 'json'>('inline')
  const [blob, setBlob] = useState<Blob>()
  const [recording, setRecording] = useState(false)
  const [recorderRevision, setRecorderRevision] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [stats, setStats] = useState<ProsodyMeasurement | null>(null)
  const [manualTag, setManualTag] = useState<TagChoice | null>(null)
  const [references, setReferences] = useState<Reference[]>([])
  const [filter, setFilter] = useState<'all' | 'words' | 'sounds' | 'expressions'>('all')
  const [query, setQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<{ phrase: string; tag: string } | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [modelDraft, setModelDraft] = useState(models)
  const setMessage = onNotice
  const [goal, setGoal] = useState<'neutral' | 'expression' | null>(null)
  const recorderPanel = useRef<HTMLElement>(null)
  const inspector = useRef<HTMLDivElement>(null)
  const tagTrigger = useRef<HTMLButtonElement | null>(null)
  const outputHeading = useRef<HTMLHeadingElement>(null)
  const decoder = useRef<AudioContext | null>(null)
  const generation = useRef(0)
  const addMenu = useRef<HTMLDetailsElement>(null)
  const cancelAnalysis = useCallback(() => {
    generation.current++
    const context = decoder.current
    decoder.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => {})
  }, [])
  useEffect(() => {
    onTakeChange(blob)
  }, [blob, onTakeChange])
  useEffect(() => {
    if (!active || editorOpen) {
      cancelAnalysis()
      setAnalyzing(false)
      setRecording(false)
    }
    return cancelAnalysis
  }, [active, editorOpen, cancelAnalysis])
  useEffect(() => {
    setModelDraft(models)
  }, [models])
  useEffect(() => {
    if (selectedTag) inspector.current?.querySelector('select')?.focus()
  }, [selectedTag])
  const busyChanged = useCallback(
    (busy: boolean) => {
      setRecording(busy)
      if (busy) {
        cancelAnalysis()
        setAnalyzing(false)
        setStats(null)
        setManualTag(null)
      }
    },
    [cancelAnalysis]
  )
  const measured = useMemo(
    () => (stats ? { ...stats, ...suppliedPace(words, stats.durationMs) } : null),
    [stats, words]
  )
  const neutral = references.find((reference) => reference.neutral)
  const comparison = measured && neutral ? compareProsody(measured, neutral.measurement) : null
  const usable =
    !!measured &&
    measured.durationMs >= 2000 &&
    measured.quietFraction < 0.85 &&
    measured.clippedFraction < 0.02
  const rawSegments: ExpressionSegment[] =
    source === 'example'
      ? segments
      : words
        ? [
            {
              id: 'personal',
              text: words,
              tags: manualTag
                ? [{ id: 'personal-tag', ...manualTag, strength: 'clear', source: 'user' }]
                : []
            }
          ]
        : []
  const phrases = personalizePhrases(rawSegments, textRules(cards))
  const output = renderExpressiveTranscript(phrases, options, format, placement)
  const corrected = phrases.some((phrase, i) => phrase.text !== rawSegments[i]!.text)
  const activeTag = selectedTag
    ? rawSegments
        .find((phrase) => phrase.id === selectedTag.phrase)
        ?.tags.find((tag) => tag.id === selectedTag.tag)
    : null
  const visibleCards = cards.filter(
    (card) =>
      (filter === 'all' ||
        (filter === 'words'
          ? card.kind !== 'sound'
          : filter === 'sounds'
            ? card.kind === 'sound'
            : false)) &&
      `${card.heard} ${card.meant}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  )
  const visibleReferences = references.filter(
    (reference) =>
      (filter === 'all' || filter === 'expressions') &&
      `${reference.neutral ? 'neutral reference' : reference.choice.label} ${reference.text}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
  )
  function focusRecording(next: 'neutral' | 'expression') {
    if (addMenu.current) addMenu.current.open = false
    setGoal(next)
    setSource('mine')
    recorderPanel.current?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center'
    })
    setMessage(
      next === 'neutral'
        ? 'Record your ordinary speaking voice, then measure it and save it as your neutral reference.'
        : 'Record an example, measure it, and choose how it sounded. Nothing is uploaded.'
    )
  }
  function rememberReference(isNeutral: boolean, selected = manualTag) {
    if (
      !blob ||
      !measured ||
      recording ||
      analyzing ||
      (isNeutral && !usable) ||
      (!isNeutral && !selected)
    )
      return
    if (!isNeutral && references.filter((reference) => !reference.neutral).length >= 8) {
      setMessage('This sample keeps up to eight expression examples. Remove one to add another.')
      return
    }
    const reference: Reference = {
      id: isNeutral ? 'neutral-reference' : crypto.randomUUID(),
      neutral: isNeutral,
      choice: isNeutral ? { kind: 'emotion', label: 'neutral' } : selected!,
      measurement: measured,
      blob,
      text: words
    }
    setReferences((old) => [...old.filter((item) => !isNeutral || !item.neutral), reference])
    if (isNeutral) {
      setManualTag({ kind: 'emotion', label: 'neutral' })
      setSource('mine')
    }
    setGoal(null)
    setMessage(
      isNeutral
        ? 'Neutral reference saved in your library for this session.'
        : 'Delivery example saved in your library for this session. No model has been retrained.'
    )
  }
  function replay(reference: Reference) {
    setRecorderRevision((value) => value + 1)
    setRecording(false)
    cancelAnalysis()
    setAnalyzing(false)
    setBlob(reference.blob)
    setStats(reference.measurement)
    setWords(reference.text)
    setManualTag(reference.choice)
    setSource('mine')
    setSelectedTag(null)
    recorderPanel.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  async function measure() {
    if (!blob || recording || analyzing) return
    cancelAnalysis()
    const token = generation.current
    setAnalyzing(true)
    setMessage('')
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
      decoder.current = context
      const buffer = await context.decodeAudioData(await blob.arrayBuffer())
      if (token !== generation.current) return
      const mono = new Float32Array(buffer.length)
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const values = buffer.getChannelData(channel)
        for (let i = 0; i < values.length; i++)
          mono[i] = mono[i]! + values[i]! / buffer.numberOfChannels
      }
      const result = measureProsody(mono, buffer.sampleRate, words)
      if (token !== generation.current) return
      setStats(result)
      setSource('mine')
      setMessage(
        'Local measurements ready. Choose a delivery label yourself; this sample does not infer emotion.'
      )
    } catch (error) {
      if (token === generation.current)
        setMessage(error instanceof Error ? error.message : 'Could not measure this take.')
    } finally {
      if (context && context.state !== 'closed') await context.close().catch(() => {})
      if (decoder.current === context) decoder.current = null
      if (token === generation.current) setAnalyzing(false)
    }
  }
  function closeInspector() {
    setSelectedTag(null)
    requestAnimationFrame(() => {
      const target = tagTrigger.current
      if (target?.isConnected) target.focus()
      else outputHeading.current?.focus()
    })
  }
  function changeTag(omit = false) {
    if (!activeTag || !selectedTag) return
    const choice = readChoice(tagDraft)
    if (!choice) return
    if (source === 'example')
      setSegments((old) =>
        old.map((phrase) =>
          phrase.id !== selectedTag.phrase
            ? phrase
            : {
                ...phrase,
                tags: phrase.tags.map((tag) =>
                  tag.id !== selectedTag.tag
                    ? tag
                    : { ...tag, ...choice, dismissed: omit, source: 'user' }
                )
              }
        )
      )
    else setManualTag(omit ? null : choice)
    closeInspector()
    setMessage(
      omit
        ? 'Tag omitted from this output.'
        : 'Tag corrected. Your words are kept separate from delivery labels.'
    )
  }
  function openTag(phrase: string, tag: string, choice: TagChoice) {
    setSelectedTag({ phrase, tag })
    setTagDraft(choiceValue(choice))
  }
  return (
    <section className="vw-workspace" hidden={!active}>
      <header className="vw-heading">
        <div>
          <span className="vl-overline">ONE SPACE. YOUR KIND OF SPEECH.</span>
          <h1>
            A little more <span>you.</span>
          </h1>
          <p>Your words, your sounds, your expression. Shape the output as you go.</p>
        </div>
        <div className="vw-heading-art" aria-hidden="true">
          <span>Siobhán</span>
          <span>[excited]</span>
          <span>♫</span>
        </div>
      </header>
      <div className="vw-studio">
        <section className="vw-output-card" aria-labelledby="vw-output-title">
          <div className="vw-card-head">
            <div>
              <span className="vl-overline">WHAT YOU’LL SEND</span>
              <h2 ref={outputHeading} tabIndex={-1} id="vw-output-title">
                Make it sound like you.
              </h2>
            </div>
            <button
              className="vl-primary"
              disabled={!output}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(output)
                  setMessage('Copied the output in your selected format.')
                } catch {
                  setMessage('Clipboard access is unavailable. Select the output text to copy it.')
                }
              }}
            >
              Copy output <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="vw-output-toolbar">
            <div className="vw-formats" aria-label="Output format">
              {(['inline', 'plain', 'json'] as const).map((item) => (
                <button key={item} aria-pressed={format === item} onClick={() => setFormat(item)}>
                  {item === 'inline'
                    ? 'With expression'
                    : item === 'plain'
                      ? 'Plain words'
                      : 'JSON'}
                </button>
              ))}
            </div>
            <OutputChoices
              value={{ placement, kinds: options.kinds, clearOnly: options.clearOnly }}
              onChange={(value) => {
                setPlacement(value.placement)
                setOptions({ ...options, kinds: value.kinds, clearOnly: value.clearOnly })
              }}
            />
          </div>
          <div className="vw-direct-copy">
            <button
              className="vl-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    renderExpressiveTranscript(phrases, options, 'plain')
                  )
                  setMessage('Words copied. Your vocabulary corrections stay.')
                } catch {
                  setMessage('Clipboard unavailable. Select the output to copy it.')
                }
              }}
            >
              Copy words
            </button>
            <button
              className="vl-primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    renderExpressiveTranscript(phrases, options, 'inline', placement)
                  )
                  setMessage('Words and selected tags copied.')
                } catch {
                  setMessage('Clipboard unavailable. Select the output to copy it.')
                }
              }}
            >
              Copy with tags
            </button>
            <span>Word corrections always stay ✓</span>
          </div>
          <div
            className={`vw-output ${format === 'json' ? 'json' : ''}`}
            data-testid="workspace-output"
            aria-label="Your output"
          >
            {format === 'json' || placement === 'context' || placement === 'after' ? (
              output
            ) : phrases.length ? (
              phrases.map((phrase) => {
                const leading = phrase.text.match(/^\s*/u)![0]
                return (
                  <span key={phrase.id}>
                    {leading}
                    {format === 'inline' &&
                      selectedExpressionTags(phrase, options).map((tag) => (
                        <span key={tag.id}>
                          <button
                            className={`vw-output-tag ${tag.kind}`}
                            aria-label={`Change ${tag.label} tag`}
                            onClick={(event) => {
                              tagTrigger.current = event.currentTarget
                              openTag(phrase.id, tag.id, tag)
                            }}
                          >
                            [{tag.label}]
                          </button>{' '}
                        </span>
                      ))}
                    {(
                      phrase.text
                        .slice(leading.length)
                        .match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|\s+|[^\p{L}\p{N}\s]+/gu) ?? []
                    ).map((part, index) =>
                      /[\p{L}\p{N}]/u.test(part) ? (
                        <button
                          className="vw-output-word"
                          key={index}
                          aria-label={`Teach word ${part}`}
                          onClick={() => onTeachWord(part)}
                        >
                          {part}
                        </button>
                      ) : (
                        <span key={index}>{part}</span>
                      )
                    )}
                  </span>
                )
              })
            ) : (
              <span className="vw-output-empty">
                Your words will appear here. Try an example, or record and supply the words you
                spoke.
              </span>
            )}
          </div>
          <div className="vw-output-status">
            <span>
              <i />
              {source === 'example'
                ? 'Example delivery tags'
                : manualTag
                  ? 'Your delivery label'
                  : 'Your supplied words'}
            </span>
            {corrected && <span>✓ Your word rules applied</span>}
            <span>No AI calls in this sample</span>
          </div>
          <div className="vw-output-help">
            <span>
              Click a <b>word</b> to remember it. Click a <b>[tag]</b> to refine the delivery.
            </span>
            <button className="vl-text-button" onClick={() => onAdd('word')}>
              ＋ Remember a word or phrase
            </button>
          </div>
          {activeTag && (
            <div
              className="vw-tag-inspector"
              ref={inspector}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeInspector()
                }
              }}
            >
              <div>
                <strong>How did this part sound?</strong>
                <button
                  className="vl-icon-button"
                  aria-label="Close tag correction"
                  onClick={closeInspector}
                >
                  ×
                </button>
              </div>
              <label className="vl-field">
                Delivery label
                <select value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}>
                  <LabelOptions />
                </select>
              </label>
              <p>
                {source === 'example'
                  ? 'This adjusts an illustrative example. No microphone emotion analysis or voice training takes place.'
                  : 'This is your own label for this take. Keep a measured example in the library to replay it later.'}
              </p>
              <div className="vw-inspector-actions">
                <button className="vl-text-button" onClick={() => changeTag(true)}>
                  Leave this tag out
                </button>
                <button className="vl-primary" onClick={() => changeTag()}>
                  Use this tag
                </button>
              </div>
            </div>
          )}
          <details className="vw-example-controls">
            <summary>Try another example or edit the words</summary>
            <div>
              <label>
                Example take
                <select
                  value={source === 'mine' ? 'mine' : scene}
                  onChange={(e) => {
                    setSelectedTag(null)
                    if (e.target.value === 'mine') setSource('mine')
                    else {
                      const next = e.target.value as Scene
                      setScene(next)
                      setSegments(sampleSegments(next))
                      setSource('example')
                    }
                  }}
                >
                  <option value="mine">My own words</option>
                  {scenes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {source === 'example' ? (
                <>
                  <p>{rawSegments.map((phrase) => phrase.text).join('')}</p>
                  <small>
                    Illustrative interpretations. Word corrections are real local rules.
                  </small>
                  <button
                    className="vl-text-button"
                    onClick={() => setSegments(sampleSegments(scene))}
                  >
                    Restore example tags
                  </button>
                </>
              ) : (
                <p>
                  Enter or paste your words beside the recorder. Saved vocabulary applies
                  immediately.
                </p>
              )}
            </div>
          </details>
        </section>
        <aside
          className="vw-recorder-panel"
          ref={recorderPanel}
          aria-labelledby="vw-recorder-title"
        >
          <span className="vl-overline">SPEAK. SEE IT. MAKE IT YOURS.</span>
          <h2 id="vw-recorder-title">One little try-it corner.</h2>
          <p className="vw-muted">
            Use the same take for a word, a sound shortcut, or an expression reference.
          </p>
          {goal && (
            <p className="vw-goal">
              {goal === 'neutral'
                ? '♡ Let’s capture your everyday voice.'
                : '✳ Let’s capture a way you express yourself.'}
              <button aria-label="Clear recording goal" onClick={() => setGoal(null)}>
                ×
              </button>
            </p>
          )}
          {active && !editorOpen && (
            <VoiceLabRecorder
              key={recorderRevision}
              blob={blob}
              onBusyChange={busyChanged}
              onChange={(next) => {
                cancelAnalysis()
                setAnalyzing(false)
                setBlob(next)
                setStats(null)
                setManualTag(null)
                setSource('mine')
                setSelectedTag(null)
              }}
            />
          )}
          <label className="vl-field">
            Words from your take
            <textarea
              rows={3}
              maxLength={1200}
              value={words}
              onChange={(e) => {
                setWords(e.target.value)
                setSource('mine')
                setSelectedTag(null)
              }}
              placeholder="Type or paste what you said. This prototype doesn’t transcribe audio."
            />
          </label>
          <p className="vw-tiny">
            Your words update the same output immediately. Audio stays in this tab.
          </p>
          <button
            className="vl-secondary vw-measure"
            disabled={!blob || recording || analyzing}
            onClick={() => void measure()}
          >
            {analyzing ? 'Measuring…' : 'Measure this take locally'}
          </button>
          {measured && (
            <>
              <div className="vw-signal-strip">
                <span>
                  <strong>
                    {measured.wordsPerMinute === null ? '—' : Math.round(measured.wordsPerMinute)}
                  </strong>
                  approx. WPM
                </span>
                <span>
                  <strong>
                    {measured.pitchMedianHz === null ? '—' : Math.round(measured.pitchMedianHz)}
                  </strong>
                  pitch · Hz
                </span>
                <span>
                  <strong>{comparison ? `${signed(comparison.energyChangeDb)}` : '—'}</strong>vs.
                  neutral · dB
                </span>
              </div>
              {measured.clippedFraction >= 0.02 && (
                <p className="vw-goal">
                  Input clipping detected. Lower microphone gain before setting a neutral reference.
                </p>
              )}
              <label className="vl-field">
                How did this take sound to you?
                <select
                  value={manualTag ? choiceValue(manualTag) : ''}
                  onChange={(e) => {
                    setManualTag(readChoice(e.target.value))
                    setSource('mine')
                  }}
                >
                  <option value="">Choose your own label…</option>
                  <LabelOptions />
                </select>
              </label>
              <div className="vw-reference-actions">
                <button
                  className="vl-primary"
                  disabled={
                    !manualTag ||
                    recording ||
                    analyzing ||
                    references.filter((reference) => !reference.neutral).length >= 8
                  }
                  onClick={() => rememberReference(false)}
                >
                  Remember this delivery
                </button>
                <button
                  className="vl-text-button"
                  disabled={!usable || recording || analyzing}
                  onClick={() => rememberReference(true)}
                >
                  {neutral ? 'Replace my neutral reference' : 'Keep as my neutral reference'}
                </button>
              </div>
              <details className="vw-measure-notes">
                <summary>What these measurements mean</summary>
                <p>
                  WPM uses your supplied words over total recorded time, including pauses; counting
                  is language-dependent. Pitch and quiet intervals are estimates. Digital energy
                  depends on microphone gain and distance. These measurements do not assign an
                  emotion.
                </p>
                <p>
                  {measured.pitchRangeSemitones === null
                    ? 'Pitch range unavailable.'
                    : `Pitch range: ${measured.pitchRangeSemitones.toFixed(1)} semitones.`}{' '}
                  Quiet frames: {Math.round(measured.quietFraction * 100)}%. Clipped samples:{' '}
                  {(measured.clippedFraction * 100).toFixed(1)}%.
                </p>
                {comparison && (
                  <p>
                    Pitch vs. neutral:{' '}
                    {comparison.pitchChangeSemitones === null
                      ? 'unavailable'
                      : `${signed(comparison.pitchChangeSemitones)} semitones`}
                    . Pace vs. neutral:{' '}
                    {comparison.paceChangePercent === null
                      ? 'supply words in both references'
                      : `${signed(comparison.paceChangePercent)}%`}
                    .
                  </p>
                )}
              </details>
            </>
          )}
          <div className="vw-recorder-note">
            <span>♡</span>
            <p>
              {neutral
                ? 'Your neutral reference is in the library below. Replay it or replace it whenever you like.'
                : 'Your everyday voice can be the reference. Start with 2–15 seconds using the same microphone and distance.'}
            </p>
          </div>
          <p className="vw-tiny">
            Local measurements and user labels only. No automatic emotion detector runs here.
          </p>
        </aside>
      </div>
      <section className="vw-library" aria-labelledby="vw-library-title">
        <div className="vw-card-head">
          <div>
            <span className="vl-overline">EVERY LITTLE THING IT SHOULD REMEMBER</span>
            <h2 id="vw-library-title">Your voice, collected.</h2>
            <p>Words, sounds, and ways you express yourself. All at home here.</p>
          </div>
          <details ref={addMenu} className="vw-add-menu">
            <summary>＋ Add something</summary>
            <div>
              {(
                [
                  { id: 'word', label: 'Word or name' },
                  { id: 'phrase', label: 'Favorite phrase' },
                  { id: 'sound', label: 'Sound shortcut' }
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (addMenu.current) addMenu.current.open = false
                    onAdd(item.id)
                  }}
                >
                  {item.label}
                </button>
              ))}
              <button onClick={() => focusRecording('expression')}>Voice expression</button>
              <button onClick={() => focusRecording('neutral')}>My neutral voice</button>
            </div>
          </details>
        </div>
        <div className="vw-library-toolbar">
          <div className="vl-filter-row" aria-label="Personal library filters">
            {(
              [
                { id: 'all', label: 'Everything' },
                { id: 'words', label: 'Words & phrases' },
                { id: 'sounds', label: 'Sounds' },
                { id: 'expressions', label: 'Expressions & references' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-pressed={filter === item.id}
                className={filter === item.id ? 'selected' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="vl-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Search personal library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find something that’s you…"
            />
          </label>
        </div>
        <div className="vw-library-grid">
          {visibleCards.map((card) => (
            <button
              key={card.id}
              className={`vw-library-card ${card.kind}`}
              onClick={() => onEdit(card)}
            >
              <span className="vw-library-icon">
                {card.kind === 'sound' ? '♫' : card.kind === 'phrase' ? '“ ”' : 'Aa'}
              </span>
              <span className="vw-library-kind">
                {card.sample ? 'EXAMPLE · ' : ''}
                {card.kind === 'sound'
                  ? 'SOUND SHORTCUT'
                  : card.kind === 'phrase'
                    ? 'PHRASE'
                    : 'WORD / NAME'}
              </span>
              <h3>{card.kind === 'sound' ? card.heard : card.meant}</h3>
              <p>
                {card.kind === 'sound' ? `Means “${card.meant}”` : `Instead of “${card.heard}”`}
              </p>
              <span className="vw-library-card-foot">
                {card.kind === 'sound'
                  ? 'Recognition planned'
                  : card.enabled
                    ? '✓ Word rule on'
                    : 'Word rule paused'}
                <span>{audio[card.id] ? '♫ Saved take' : 'Edit ↗'}</span>
              </span>
            </button>
          ))}
          {visibleReferences.map((reference) => (
            <article key={reference.id} className="vw-library-card expression">
              <span className="vw-library-icon">{reference.neutral ? '♡' : '✳'}</span>
              <span className="vw-library-kind">
                {reference.neutral ? 'MY NEUTRAL REFERENCE' : 'MY DELIVERY EXAMPLE'} · SESSION ONLY
              </span>
              <h3>{reference.neutral ? 'My everyday voice' : `[${reference.choice.label}]`}</h3>
              <p>
                {(reference.measurement.durationMs / 1000).toFixed(1)} seconds · your recording and
                label
              </p>
              <div className="vw-library-card-foot">
                <button className="vl-text-button" onClick={() => replay(reference)}>
                  Replay & compare
                </button>
                <button
                  className="vl-text-button"
                  aria-label={`Remove ${reference.neutral ? 'neutral reference' : reference.choice.label + ' example'}`}
                  onClick={() =>
                    setReferences((old) => old.filter((item) => item.id !== reference.id))
                  }
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
          {!query && (filter === 'all' || filter === 'expressions') && !neutral && (
            <button
              className="vw-library-card vw-empty-reference"
              onClick={() => focusRecording('neutral')}
            >
              <span className="vw-library-icon">♡</span>
              <span className="vw-library-kind">A LITTLE CONTEXT GOES A LONG WAY</span>
              <h3>What’s ordinary for you?</h3>
              <p>Add a neutral voice reference. No accent score. No right way to sound.</p>
              <span className="vw-library-card-foot">＋ Set up from the same recorder</span>
            </button>
          )}
        </div>
        {!visibleCards.length && !visibleReferences.length && (
          <p className="vw-muted">
            {query
              ? 'No matches. Try another word or clear your search.'
              : 'Nothing saved here yet. Add a word, or use the recorder to keep a voice reference.'}
          </p>
        )}
        <p className="vw-tiny">
          Word and sound cards stay in this browser. Audio and voice references disappear on reload.
          Saved examples do not retrain a model.
        </p>
      </section>
      <details className="vw-model-settings">
        <summary>
          <span>◈ Models & interpretation</span>
          <small>Edit model IDs here, without leaving your voice.</small>
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (
              !validModelSlug(modelDraft.speech.trim()) ||
              !validModelSlug(modelDraft.cues.trim())
            ) {
              setMessage('Use a model ID like provider/model-name in both fields.')
              return
            }
            onModelsChange({ speech: modelDraft.speech.trim(), cues: modelDraft.cues.trim() })
            setMessage('Model preferences saved in this browser. Desktop settings are unchanged.')
          }}
        >
          <div>
            <label className="vl-field">
              Speech → text model ID
              <input
                required
                maxLength={160}
                value={modelDraft.speech}
                onChange={(e) => setModelDraft({ ...modelDraft, speech: e.target.value })}
                spellCheck={false}
              />
            </label>
            <label className="vl-field">
              Emotion & delivery model ID
              <input
                required
                maxLength={160}
                value={modelDraft.cues}
                onChange={(e) => setModelDraft({ ...modelDraft, cues: e.target.value })}
                spellCheck={false}
              />
            </label>
          </div>
          <p>
            This sample saves preferences only and makes no paid requests. Audio interpretation in
            the desktop design will be a separate, explicit opt-in that explains audio uploads and
            cost. Model availability and audio support must be checked when connected.
          </p>
          <button className="vl-primary">Save model preferences</button>
          <button
            type="button"
            className="vl-text-button"
            onClick={() => {
              setModelDraft(models)
              setMessage('Unsaved model edits discarded.')
            }}
          >
            Discard edits
          </button>
        </form>
      </details>
      <p className="vw-scope">
        A working interface prototype: local word rules, audio capture, acoustic measurements, and
        user-authored labels. Automatic transcription, emotion inference, and sound recognition are
        not connected here.
      </p>
    </section>
  )
}
