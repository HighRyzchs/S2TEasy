import { useEffect, useMemo, useState } from 'react'
import type { ModelOption } from '@shared/types'
import { CUE_LABELS, EMOTIONS, type CueAnalysis, type CueKind, type Emotion, type SpeechCueSettings } from '@shared/speech-cues'
import { renderOutput, type OutputPreferences } from '@shared/output'
import { useApp } from '../context'

const GROUPS: { key: 'emotions' | 'delivery' | 'pacing' | 'events'; name: string; hint: string }[] = [
  { key: 'emotions', name: 'Emotions', hint: 'excited, calm, upset…' },
  { key: 'delivery', name: 'Delivery', hint: 'monotone, soft, emphasis…' },
  { key: 'pacing', name: 'Pacing', hint: 'slow, steady, fast' },
  { key: 'events', name: 'Sounds', hint: 'laughter, sighs' }
]

const KIND_NAME: Record<CueKind, string> = { emotion: 'Emotions', delivery: 'Delivery', pacing: 'Pacing', event: 'Sounds' }

const SAMPLE: Pick<{ text: string; cueAnalysis: CueAnalysis }, 'text' | 'cueAnalysis'> = {
  text: 'No way, he actually said yes! Hold on, let me grab a quick bite first.',
  cueAnalysis: {
    schemaVersion: 1,
    id: 'sample',
    model: 'sample',
    createdAt: 0,
    startMs: 0,
    endMs: 6000,
    quality: 'usable',
    summary: 'Sample',
    observations: { durationMs: 6000, rms: 0.1, clippedFraction: 0, quietIntervals: [] },
    cues: [
      { id: 'c1', kind: 'emotion', label: 'excited', strength: 'clear', startMs: 0, endMs: 2400, evidence: 'sample' },
      { id: 'c2', kind: 'event', label: 'laughter', strength: 'clear', startMs: 2400, endMs: 3600, evidence: 'sample' },
      { id: 'c3', kind: 'pacing', label: 'fast', strength: 'tentative', startMs: 3600, endMs: 6000, evidence: 'sample' }
    ]
  }
}

const PLACEMENTS: { id: OutputPreferences['placement']; name: string }[] = [
  { id: 'before', name: 'Before the words' },
  { id: 'after', name: 'After the words' },
  { id: 'context', name: 'As a context note' }
]

function SpeechCuesCard() {
  const { settings, save, run, navigate } = useApp()
  const cues = settings.speechCues
  const [guidance, setGuidance] = useState(cues.guidance)
  const [models, setModels] = useState<ModelOption[]>([])
  const hasKey = !!settings.apiKey
  useEffect(() => setGuidance(cues.guidance), [cues.guidance])
  const change = (patch: Partial<SpeechCueSettings>) => run(() => save({ speechCues: { ...cues, ...patch } }))
  const modelOptions = useMemo(
    () => (models.some((m) => m.slug === cues.model) ? models : [{ slug: cues.model, name: cues.model }, ...models]),
    [models, cues.model]
  )

  return (
    <section className="card" aria-label="Speech cues">
      <div className="card-head">
        <h2>Speech cues</h2>
        <div className="seg" role="group" aria-label="Speech cues">
          <button type="button" aria-pressed={!cues.enabled} onClick={() => void change({ enabled: false, automatic: false })}>Off</button>
          <button type="button" aria-pressed={cues.enabled} onClick={() => void change({ enabled: true, automatic: true })}>On</button>
        </div>
      </div>
      <p className="dim">
        Tags for how you said it, like [excited] or [laughs], written into your text. The HUD’s Cues switch turns them on or off for a single session.
      </p>
      <p className="hint">
        {cues.enabled
          ? 'On: after you finish, S2Teasy sends up to 30 seconds of that session’s audio to an audio model for one analysis. Your provider bills it. Laughs and sighs are found the same way, not on this PC.'
          : 'Off: no audio is analyzed and nothing extra is billed.'}
        {cues.enabled && !cues.automatic && ' You chose to start each analysis yourself from History.'}
      </p>
      {cues.enabled && !hasKey && (
        <div className="notice-line" role="status">
          <span>Cues need an OpenRouter key.</span>
          <button className="link" type="button" onClick={() => navigate('settings', { section: 'engine' })}>Add it in Settings</button>
        </div>
      )}

      <div className="field">
        <span className="label">Audio model</span>
        <div className="actions">
          <select
            className="select model-select"
            aria-label="Audio model"
            value={cues.model}
            onChange={(e) => void change({ model: e.target.value })}
          >
            {modelOptions.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name}</option>
            ))}
          </select>
          <button
            className="btn small"
            type="button"
            disabled={!hasKey}
            title={hasKey ? undefined : 'Needs an OpenRouter key'}
            onClick={() => void run(async () => setModels(await window.s2t.fetchCueModels()))}
          >
            Load models
          </button>
        </div>
        <span className="hint">Loading the list is free. Audio is billed by the model you pick.</span>
      </div>

      <div className="field">
        <span className="label">Which cues to listen for</span>
        <div className="chips">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" className="chip" aria-pressed={cues[g.key]} title={g.hint} onClick={() => void change({ [g.key]: !cues[g.key] })}>
              {g.name}
            </button>
          ))}
        </div>
        {cues.emotions && (
          <>
            <span className="hint">Emotion words it may use. None selected means no emotion tags.</span>
            <div className="chips">
              {EMOTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  aria-pressed={cues.emotionLabels.includes(label)}
                  onClick={() =>
                    void change({
                      emotionLabels: cues.emotionLabels.includes(label)
                        ? cues.emotionLabels.filter((l) => l !== label)
                        : (EMOTIONS.filter((l) => l === label || cues.emotionLabels.includes(l as Emotion)) as Emotion[])
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <label className="check">
        <input type="checkbox" checked={cues.clearOnly} onChange={(e) => void change({ clearOnly: e.target.checked })} />
        <span>
          Only clear cues
          <small className="hint">Skip the ones the model calls tentative. That is its own assessment, not a measured probability.</small>
        </span>
      </label>

      <label className="field">
        <span className="label">How you usually sound (optional)</span>
        <textarea
          className="input"
          rows={3}
          maxLength={500}
          value={guidance}
          placeholder="For example: my voice is usually quiet and even, so do not read that alone as sad."
          onChange={(e) => setGuidance(e.target.value)}
          onBlur={() => guidance.trim() !== cues.guidance && void change({ guidance: guidance.trim() })}
        />
        <span className="hint">Sent with each analysis. Keep private names and secrets out of it.</span>
      </label>
    </section>
  )
}

function TagStyleCard() {
  const { settings, run } = useApp()
  const [prefs, setPrefs] = useState<OutputPreferences>(settings.output)
  useEffect(() => setPrefs(settings.output), [settings.output])
  const update = (next: OutputPreferences) => {
    setPrefs(next)
    void run(async () => {
      try {
        setPrefs((await window.s2t.saveOutput(next)).output)
      } catch (e) {
        setPrefs(settings.output)
        throw e
      }
    })
  }
  const preview = renderOutput(SAMPLE, prefs, 'tags')

  return (
    <section className="card" aria-label="How tags appear">
      <div className="card-head">
        <h2>How tags appear in your text</h2>
      </div>
      <p className="dim">Used when you copy or type with tags. It never changes what the speech engine hears.</p>
      <div className="seg" role="group" aria-label="Tag placement">
        {PLACEMENTS.map((p) => (
          <button key={p.id} type="button" aria-pressed={prefs.placement === p.id} onClick={() => update({ ...prefs, placement: p.id })}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="field">
        <span className="label">Preview</span>
        <pre className="tag-preview" aria-label="Preview of tagged text">{preview}</pre>
      </div>
      <div className="field">
        <span className="label">Include</span>
        <div className="chips">
          {(Object.keys(CUE_LABELS) as CueKind[]).map((kind) => (
            <button key={kind} type="button" className="chip" aria-pressed={prefs.kinds[kind]} onClick={() => update({ ...prefs, kinds: { ...prefs.kinds, [kind]: !prefs.kinds[kind] } })}>
              {KIND_NAME[kind]}
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={prefs.clearOnly} onChange={(e) => update({ ...prefs, clearOnly: e.target.checked })} />
        <span>
          Only tag clear cues
          <small className="hint">In the preview, the tentative “fast” cue appears only when this is off.</small>
        </span>
      </label>
    </section>
  )
}

export function ExpressionTab() {
  return (
    <div className="columns voice-columns expr">
      <div className="col">
        <SpeechCuesCard />
      </div>
      <div className="col">
        <TagStyleCard />
      </div>
    </div>
  )
}
