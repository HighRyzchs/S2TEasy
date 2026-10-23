import { useEffect, useRef, useState } from 'react'
import {
  defaultExpressionOptions,
  EXPRESSION_LABELS,
  renderExpressiveTranscript,
  selectedExpressionTags,
  type ExpressionKind,
  type ExpressionSegment
} from '@shared/expressive-transcript'
import { compareProsody, measureProsody, type ProsodyMeasurement } from '@shared/prosody'
import { VoiceLabRecorder } from './VoiceLabRecorder'
import './expression-lab.css'

const kinds: { id: ExpressionKind; label: string; hint: string }[] = [
  { id: 'emotion', label: 'Emotion', hint: 'excited, upset, angry, calm…' },
  { id: 'delivery', label: 'Voice & emphasis', hint: 'whispering, monotone, raised voice…' },
  { id: 'pacing', label: 'Pacing', hint: 'speaking quickly, hesitant…' },
  { id: 'event', label: 'Nonverbal sounds', hint: 'laughs, sighs, gasps…' }
]
const scenes = [
  { id: 'shifting', name: 'A change in tone', subtitle: 'Calm → excited → uncertain' },
  { id: 'excited', name: 'Same words, excited', subtitle: 'Bouncy pitch, faster delivery' },
  { id: 'upset', name: 'Same words, upset', subtitle: 'Tense delivery, longer pauses' },
  { id: 'neutral', name: 'Low & steady', subtitle: 'Even delivery ≠ sadness' }
] as const
type Scene = (typeof scenes)[number]['id']
function sampleSegments(scene: Scene): ExpressionSegment[] {
  const tag = (
    id: string,
    kind: ExpressionKind,
    label: string,
    strength: 'clear' | 'tentative' = 'clear'
  ) => ({ id, kind, label, strength, source: 'sample-model' as const })
  if (scene === 'shifting')
    return [
      { id: 'one', text: 'Okay, let’s take a look. ', tags: [tag('a', 'emotion', 'calm')] },
      {
        id: 'two',
        text: 'Wait, we actually did it! ',
        tags: [
          tag('b', 'emotion', 'excited'),
          tag('c', 'pacing', 'speaking quickly'),
          tag('d', 'event', 'laughs')
        ]
      },
      {
        id: 'three',
        text: 'Are you sure that’s the final result?',
        tags: [tag('e', 'emotion', 'uncertain', 'tentative'), tag('f', 'delivery', 'soft')]
      }
    ]
  const words = ['I didn’t expect that. ', 'Tell me what happened. ', 'Okay, I’m listening.']
  const labels =
    scene === 'excited'
      ? ['excited', 'happy', 'excited']
      : scene === 'upset'
        ? ['upset', 'frustrated', 'upset']
        : ['neutral', 'neutral', 'neutral']
  return words.map((text, i) => ({
    id: `line-${i}`,
    text,
    tags: [
      tag(`emotion-${i}`, 'emotion', labels[i]!),
      ...(i === 1
        ? [
            tag(
              'delivery',
              'delivery',
              scene === 'neutral' ? 'monotone' : scene === 'upset' ? 'trembling' : 'animated'
            )
          ]
        : [])
    ]
  }))
}
const sampleMeasurements: Record<
  Scene,
  { wpm: number; pitch: string; energy: string; pauses: string }
> = {
  shifting: { wpm: 168, pitch: '7.2 st', energy: '+3.4 dB', pauses: '18%' },
  excited: { wpm: 192, pitch: '9.1 st', energy: '+4.2 dB', pauses: '11%' },
  upset: { wpm: 119, pitch: '6.5 st', energy: '+2.1 dB', pauses: '29%' },
  neutral: { wpm: 136, pitch: '2.3 st', energy: '+0.0 dB', pauses: '17%' }
}
type LabeledExample = {
  id: string
  label: string
  measurement: ProsodyMeasurement
  blob: Blob
  text: string
}
const signed = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`

export function ExpressionLab({ active, model }: { active: boolean; model: string }) {
  const [mode, setMode] = useState<'examples' | 'recording'>('examples')
  const [scene, setScene] = useState<Scene>('shifting')
  const [segments, setSegments] = useState(() => sampleSegments('shifting'))
  const [options, setOptions] = useState(() => ({ ...defaultExpressionOptions(), enabled: true }))
  const [format, setFormat] = useState<'inline' | 'plain' | 'json'>('inline')
  const [blob, setBlob] = useState<Blob>()
  const [recording, setRecording] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [words, setWords] = useState('')
  const [measuredWords, setMeasuredWords] = useState('')
  const [measurement, setMeasurement] = useState<ProsodyMeasurement | null>(null)
  const [neutral, setNeutral] = useState<ProsodyMeasurement | null>(null)
  const [label, setLabel] = useState('neutral')
  const [examples, setExamples] = useState<LabeledExample[]>([])
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const context = useRef<AudioContext | null>(null)
  useEffect(() => {
    setAnalyzing(false)
    if (!active) {
      generation.current++
      void context.current?.close().catch(() => {})
      context.current = null
      setAnalyzing(false)
    }
    return () => {
      generation.current++
      void context.current?.close().catch(() => {})
      context.current = null
    }
  }, [active, mode])
  useEffect(() => {
    if (!recording) return
    generation.current++
    void context.current?.close().catch(() => {})
    context.current = null
    setAnalyzing(false)
    setMeasurement(null)
    setMeasuredWords('')
  }, [recording])
  async function analyze() {
    if (!blob) return
    const token = ++generation.current
    setAnalyzing(true)
    setMessage('')
    const decoder = new AudioContext()
    context.current = decoder
    try {
      const buffer = await decoder.decodeAudioData(await blob.arrayBuffer())
      if (token !== generation.current) return
      const mono = new Float32Array(buffer.length)
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel)
        for (let i = 0; i < samples.length; i++)
          mono[i] = mono[i]! + samples[i]! / buffer.numberOfChannels
      }
      const result = measureProsody(mono, buffer.sampleRate, words)
      if (token !== generation.current) return
      setMeasurement(result)
      setMeasuredWords(words)
      setMessage(
        'Acoustic measurements ready. Emotion is not inferred here; label the take yourself to preview its output.'
      )
    } catch (error) {
      if (token === generation.current)
        setMessage(error instanceof Error ? error.message : 'Could not measure this recording.')
    } finally {
      if (decoder.state !== 'closed') await decoder.close().catch(() => {})
      if (context.current === decoder) context.current = null
      if (token === generation.current) setAnalyzing(false)
    }
  }
  const personalSegments: ExpressionSegment[] =
    measuredWords.trim() && measurement
      ? [
          {
            id: 'personal',
            text: measuredWords,
            tags: [
              { id: 'personal-label', label, kind: 'emotion', strength: 'clear', source: 'user' }
            ]
          }
        ]
      : []
  const currentSegments = mode === 'examples' ? segments : personalSegments
  const output = renderExpressiveTranscript(currentSegments, options, format)
  const comparison = measurement && neutral ? compareProsody(measurement, neutral) : null
  const sample = sampleMeasurements[scene]
  const usable =
    measurement &&
    measurement.durationMs >= 2000 &&
    measurement.quietFraction < 0.85 &&
    measurement.clippedFraction < 0.02
  const transcriptCard = (
    <section className="el-transcript-card">
      <div className="el-section-head">
        <div>
          <span className="vl-overline">WHAT LEAVES S2TEASY</span>
          <h2>Expression, in the output.</h2>
        </div>
        <button
          className="vl-secondary"
          disabled={!output}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(output)
              setMessage('Output copied with your selected format and tag filters.')
            } catch {
              setMessage('Clipboard access is unavailable. Select the output text to copy it.')
            }
          }}
        >
          Copy output
        </button>
      </div>
      <div className="el-format-tabs" aria-label="Transcript format">
        {(['inline', 'plain', 'json'] as const).map((item) => (
          <button key={item} aria-pressed={format === item} onClick={() => setFormat(item)}>
            {item === 'inline'
              ? 'Inline tags'
              : item === 'plain'
                ? 'Plain text'
                : 'Structured JSON'}
          </button>
        ))}
      </div>
      <div
        className={`el-output ${format === 'json' ? 'json' : ''}`}
        data-testid="expression-output"
        aria-label="Expressive transcript output"
      >
        {format === 'inline' ? (
          currentSegments.length ? (
            currentSegments.map((segment) => {
              const tags = selectedExpressionTags(segment, options)
              const leading = segment.text.match(/^\s*/u)![0]
              return (
                <span key={segment.id}>
                  {leading}
                  {tags.map((tag) => (
                    <span key={tag.id} className={`el-inline-tag ${tag.kind}`}>
                      [{tag.label}]{' '}
                    </span>
                  ))}
                  {segment.text.slice(leading.length)}
                </span>
              )
            })
          ) : (
            <span className="el-empty">
              Record, supply the spoken words, and measure the take to preview your own labeled
              output.
            </span>
          )
        ) : (
          output || 'Your output will appear here.'
        )}
      </div>
      <div className="el-output-foot">
        <span>
          <i />
          {mode === 'examples'
            ? 'Example audio interpretation'
            : 'Your label · not AI emotion detection'}
        </span>
        <span>Original wording preserved</span>
      </div>
    </section>
  )
  return (
    <section className="el-lab" hidden={!active}>
      <section className="el-hero">
        <div>
          <span className="vl-overline">EXPRESSIVE TRANSCRIPTION · DESIGN PROTOTYPE</span>
          <h1>
            The words.
            <br />
            And <span>how you said them.</span>
          </h1>
          <p>
            A softer “okay.” An excited rush. A frustrated pause.
            <br />
            Bring the delivery into your transcript, right where it belongs.
          </p>
        </div>
        <div className="el-hero-stack" aria-hidden="true">
          <span>[excited]</span>
          <span>[whispering]</span>
          <span>[sighs]</span>
          <i>your voice has layers.</i>
        </div>
      </section>
      <div className="el-feature-switch">
        <div>
          <span className="el-switch-symbol">✳</span>
          <div>
            <strong>Include expression tags</strong>
            <p>Keep every spoken word. Add optional hints about its delivery.</p>
          </div>
        </div>
        <label className="el-switch">
          <input
            type="checkbox"
            aria-label="Include expression tags"
            checked={options.enabled}
            onChange={(e) => setOptions({ ...options, enabled: e.target.checked })}
          />
          <span /> <b>{options.enabled ? 'On in this sample' : 'Plain words only'}</b>
        </label>
      </div>
      <div className="el-mode-tabs" aria-label="Expression input">
        <button
          aria-pressed={mode === 'examples'}
          onClick={() => {
            setMode('examples')
            setMessage('')
          }}
        >
          Explore example output
        </button>
        <button
          aria-pressed={mode === 'recording'}
          onClick={() => {
            setMode('recording')
            setMessage('')
          }}
        >
          Try my voice locally
        </button>
      </div>
      <div className="el-workbench">
        <div className="el-primary-column">
          {mode === 'examples' && transcriptCard}
          {mode === 'examples' ? (
            <section className="el-input-card">
              <div className="el-section-head">
                <div>
                  <span className="vl-overline">SAME TEXT CAN SOUND VERY DIFFERENT</span>
                  <h2>Listen beyond the words.</h2>
                </div>
                <span className="el-status-pill">ILLUSTRATIVE SCENARIOS</span>
              </div>
              <div className="el-scene-grid">
                {scenes.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={scene === item.id}
                    onClick={() => {
                      setScene(item.id)
                      setSegments(sampleSegments(item.id))
                      setMessage('')
                    }}
                  >
                    <span>
                      {item.id === 'shifting'
                        ? '〰'
                        : item.id === 'excited'
                          ? '✳'
                          : item.id === 'upset'
                            ? '☁'
                            : '○'}
                    </span>
                    <strong>{item.name}</strong>
                    <small>{item.subtitle}</small>
                  </button>
                ))}
              </div>
              <p className="el-source-note">
                Example model interpretations and metrics, not analysis of your microphone. Change a
                tag below to try correcting the interpretation.
              </p>
            </section>
          ) : (
            <section className="el-input-card">
              <div className="el-section-head">
                <div>
                  <span className="vl-overline">YOUR VOICE · ON THIS DEVICE</span>
                  <h2>Start with your everyday voice.</h2>
                </div>
                <span className="el-status-pill">LOCAL MEASUREMENTS</span>
              </div>
              <p className="el-body">
                Record 2–15 seconds in your usual speaking voice. Measure a neutral reference, then
                compare an expressive take using the same microphone and distance.
              </p>
              {active && (
                <VoiceLabRecorder
                  blob={blob}
                  onBusyChange={setRecording}
                  onChange={(next) => {
                    generation.current++
                    setAnalyzing(false)
                    setBlob(next)
                    setMeasurement(null)
                    setMeasuredWords('')
                    setMessage('')
                  }}
                />
              )}
              <label className="vl-field">
                Words you recorded (optional)
                <textarea
                  rows={2}
                  maxLength={1200}
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  placeholder="Type the words you actually spoke to calculate an approximate WPM."
                />
              </label>
              {measurement && words !== measuredWords && (
                <p className="vl-note">
                  Words changed. Measure again to update the WPM and output.
                </p>
              )}
              <p className="vl-fine">
                WPM uses your supplied words divided by total recorded time, including pauses. This
                browser sample does not transcribe audio. Word counting is approximate and
                language-dependent.
              </p>
              <button
                className="vl-primary"
                disabled={!blob || recording || analyzing}
                onClick={() => void analyze()}
              >
                {analyzing ? 'Measuring…' : 'Measure my recording'}
              </button>
              {measurement && (
                <>
                  {measurement.clippedFraction >= 0.02 && (
                    <p className="vl-note">
                      The input clipped in {(measurement.clippedFraction * 100).toFixed(1)}% of
                      samples. Lower microphone gain or move slightly farther away before setting a
                      neutral reference.
                    </p>
                  )}
                  <div className="el-reference-actions">
                    <button
                      className="vl-secondary"
                      disabled={!usable || recording || analyzing || words !== measuredWords}
                      onClick={() => {
                        setNeutral(measurement)
                        setMessage(
                          'Neutral reference set for this page session. It is a comparison point, not a trained emotion model.'
                        )
                      }}
                    >
                      Use as my neutral reference
                    </button>
                    <span>
                      {usable
                        ? 'Keep this one if it sounds ordinary for you.'
                        : 'Use at least 2 seconds with audible, unclipped speech.'}
                    </span>
                  </div>
                  <div className="el-label-take">
                    <label className="vl-field">
                      How did this take sound to you?
                      <select value={label} onChange={(e) => setLabel(e.target.value)}>
                        {EXPRESSION_LABELS.emotion.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="vl-secondary"
                      disabled={
                        examples.length >= 8 || recording || analyzing || words !== measuredWords
                      }
                      onClick={() => {
                        if (!blob) return
                        setExamples((old) => [
                          ...old,
                          { id: crypto.randomUUID(), label, measurement, blob, text: measuredWords }
                        ])
                        setMessage(
                          'Labeled example kept in this page session. Future personalization will use these references; no model has been trained.'
                        )
                      }}
                    >
                      Keep labeled example
                    </button>
                  </div>
                  <p className="vl-fine">
                    Your chosen label previews a user-authored tag. Pitch, WPM and volume alone
                    cannot tell us whether you are angry or excited.
                  </p>
                </>
              )}
            </section>
          )}
          {mode === 'recording' && transcriptCard}
          {mode === 'examples' && (
            <section className="el-review">
              <div className="el-section-head">
                <div>
                  <span className="vl-overline">MAKE THE INTERPRETATION FEEL RIGHT</span>
                  <h2>“That’s my excited voice.”</h2>
                </div>
                <button
                  className="vl-text-button"
                  onClick={() => setSegments(sampleSegments(scene))}
                >
                  Restore example tags
                </button>
              </div>
              <p className="el-body">
                Correct a tag or leave it out. A future personal profile should learn from examples
                you approve, while keeping your original words intact.
              </p>
              {segments.map((segment, i) => (
                <div className="el-review-line" key={segment.id}>
                  <span className="el-line-number">0{i + 1}</span>
                  <div>
                    <p>{segment.text}</p>
                    <div className="el-tag-editors">
                      {segment.tags.map((tag) => (
                        <div
                          key={tag.id}
                          className={`el-tag-editor ${tag.dismissed ? 'dismissed' : ''}`}
                        >
                          <select
                            aria-label={`Tag for phrase ${i + 1}: ${tag.kind}`}
                            value={tag.label}
                            onChange={(e) =>
                              setSegments((old) =>
                                old.map((row) =>
                                  row.id === segment.id
                                    ? {
                                        ...row,
                                        tags: row.tags.map((item) =>
                                          item.id === tag.id
                                            ? {
                                                ...item,
                                                label: e.target.value,
                                                source: 'user',
                                                dismissed: false
                                              }
                                            : item
                                        )
                                      }
                                    : row
                                )
                              )
                            }
                          >
                            {EXPRESSION_LABELS[tag.kind].map((item) => (
                              <option key={item} value={item}>
                                [{item}]
                              </option>
                            ))}
                          </select>
                          <button
                            aria-label={`${tag.dismissed ? 'Restore' : 'Omit'} ${tag.label} tag`}
                            onClick={() =>
                              setSegments((old) =>
                                old.map((row) =>
                                  row.id === segment.id
                                    ? {
                                        ...row,
                                        tags: row.tags.map((item) =>
                                          item.id === tag.id
                                            ? { ...item, dismissed: !item.dismissed }
                                            : item
                                        )
                                      }
                                    : row
                                )
                              )
                            }
                          >
                            {tag.dismissed ? '↶' : '×'}
                          </button>
                          <small>
                            {tag.source === 'user'
                              ? 'your correction'
                              : tag.strength === 'tentative'
                                ? 'tentative · hidden if clear only'
                                : 'example: clear'}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="el-side-column">
          <section className="el-controls">
            <span className="vl-overline">A LITTLE OR A LOT. YOU CHOOSE.</span>
            <h2>What should come through?</h2>
            {kinds.map((kind) => (
              <label className="el-option" key={kind.id}>
                <input
                  type="checkbox"
                  checked={options.kinds[kind.id]}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      kinds: { ...options.kinds, [kind.id]: e.target.checked }
                    })
                  }
                />
                <span>
                  <strong>{kind.label}</strong>
                  <small>{kind.hint}</small>
                </span>
              </label>
            ))}
            <label className="el-option el-clear-only">
              <input
                type="checkbox"
                checked={options.clearOnly}
                onChange={(e) => setOptions({ ...options, clearOnly: e.target.checked })}
              />
              <span>
                <strong>Only clear interpretations</strong>
                <small>Hide tentative model tags. Your explicit corrections stay visible.</small>
              </span>
            </label>
            <p className="vl-fine">
              “Clear” is a model assessment, not a calibrated probability. Tags describe perceived
              delivery and can be wrong.
            </p>
          </section>
          <section className="el-metrics">
            <div className="el-section-head">
              <div>
                <span className="vl-overline">
                  {mode === 'examples' ? 'EXAMPLE SIGNALS' : 'MEASURED ON THIS DEVICE'}
                </span>
                <h2>The shape of a voice.</h2>
              </div>
            </div>
            <p className="el-body">Clues for an audio model. Not an emotion score.</p>
            <div className="el-metric">
              <span>Pace</span>
              <strong>
                {mode === 'examples'
                  ? sample.wpm
                  : measurement?.wordsPerMinute == null
                    ? '—'
                    : Math.round(measurement.wordsPerMinute)}
                <small> WPM</small>
              </strong>
              <p>
                {mode === 'examples'
                  ? 'Sample words / sample duration'
                  : measurement?.wordsPerMinute == null
                    ? 'Supply the spoken words, then measure.'
                    : `${measurement.wordCount} supplied words / ${(measurement.durationMs / 1000).toFixed(1)}s including pauses`}
              </p>
            </div>
            <div className="el-metric">
              <span>Pitch movement</span>
              <strong>
                {mode === 'examples'
                  ? sample.pitch
                  : measurement?.pitchRangeSemitones == null
                    ? '—'
                    : `${measurement.pitchRangeSemitones.toFixed(1)} st`}
              </strong>
              <p>
                {mode === 'examples'
                  ? 'Illustrative pitch range'
                  : measurement?.pitchMedianHz == null
                    ? 'No stable pitch estimate in this take.'
                    : `10–90% range · median ${Math.round(measurement.pitchMedianHz)} Hz`}
              </p>
            </div>
            <div className="el-metric">
              <span>Energy vs. your neutral</span>
              <strong>
                {mode === 'examples'
                  ? sample.energy
                  : comparison
                    ? `${signed(comparison.energyChangeDb)} dB`
                    : '—'}
              </strong>
              <p>
                {mode === 'examples'
                  ? 'Illustrative difference, not a microphone reading'
                  : comparison
                    ? 'Digital level difference; mic distance and gain matter.'
                    : 'Measure a take and set a neutral reference first.'}
              </p>
            </div>
            <div className="el-metric">
              <span>Quiet frames</span>
              <strong>
                {mode === 'examples'
                  ? sample.pauses
                  : measurement
                    ? `${Math.round(measurement.quietFraction * 100)}%`
                    : '—'}
              </strong>
              <p>Energy threshold estimate; not word-aligned pauses.</p>
            </div>
            {mode === 'recording' && measurement && (
              <div
                className="el-envelope"
                role="img"
                aria-label="Measured recording energy envelope"
              >
                {measurement.envelope.map((v, i) => (
                  <i key={i} style={{ height: Math.max(2, Math.min(45, v * 210)) }} />
                ))}
              </div>
            )}
          </section>
          <section className="el-neutral">
            <span>♡</span>
            <h2>Your normal is the reference.</h2>
            <p>
              {neutral
                ? `Neutral set · ${(neutral.durationMs / 1000).toFixed(1)}s · ${neutral.pitchMedianHz === null ? 'pitch unavailable' : `${Math.round(neutral.pitchMedianHz)} Hz median`}`
                : 'Some people speak quickly. Some are naturally quiet or monotone. A personal baseline helps avoid treating those traits as emotion.'}
            </p>
            {comparison && (
              <div className="el-baseline-deltas">
                <span>
                  Pitch:{' '}
                  {comparison.pitchChangeSemitones === null
                    ? 'unavailable'
                    : `${signed(comparison.pitchChangeSemitones)} st`}
                </span>
                <span>
                  Pace:{' '}
                  {comparison.paceChangePercent === null
                    ? 'needs supplied words in both takes'
                    : `${signed(comparison.paceChangePercent, 0)}%`}
                </span>
              </div>
            )}
            <button
              className="vl-text-button"
              onClick={() => {
                if (neutral) {
                  setNeutral(null)
                  setMessage('Neutral reference cleared.')
                } else setMode('recording')
              }}
            >
              {neutral ? 'Clear neutral reference' : 'Try a neutral reference'}
            </button>
            <small>Session only. No speaker embedding or model training.</small>
          </section>
        </aside>
      </div>
      {examples.length > 0 && (
        <section className="el-examples">
          <div className="el-section-head">
            <div>
              <span className="vl-overline">YOUR LABELED REFERENCES · {examples.length}/8</span>
              <h2>A few ways you sound.</h2>
            </div>
          </div>
          <div>
            {examples.map((example) => (
              <article key={example.id}>
                <span>[{example.label}]</span>
                <p>
                  {(example.measurement.durationMs / 1000).toFixed(1)}s ·{' '}
                  {example.measurement.pitchMedianHz === null
                    ? 'pitch unavailable'
                    : `${Math.round(example.measurement.pitchMedianHz)} Hz`}
                </p>
                <button
                  className="vl-text-button"
                  onClick={() => {
                    setMode('recording')
                    setBlob(example.blob)
                    setMeasurement(example.measurement)
                    setWords(example.text)
                    setMeasuredWords(example.text)
                    setLabel(example.label)
                  }}
                >
                  Replay & compare
                </button>
                <button
                  className="vl-text-button"
                  onClick={() => setExamples((old) => old.filter((item) => item.id !== example.id))}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
          <p className="vl-fine">
            Audio, references and labels stay in memory and disappear when this page reloads. They
            are not automatically sent to an AI.
          </p>
        </section>
      )}
      <section className="el-pipeline">
        <span className="vl-overline">THE AUTOMATIC APP FLOW WE’RE DESIGNING</span>
        <div>
          <span>Microphone audio</span>
          <b>→</b>
          <span>Words + acoustic features</span>
          <b>→</b>
          <span>Audio model + your reference</span>
          <b>→</b>
          <span>[tags] + original words</span>
        </div>
        <p>
          The desktop integration still needs automatic phrase analysis and alignment. This sample
          demonstrates rendering and local measurements; it does not run a cloud emotion detector or
          live STT. Audio understanding model preference: <code>{model}</code>.
        </p>
      </section>
      <p className="el-message" role="status">
        {message}
      </p>
    </section>
  )
}
