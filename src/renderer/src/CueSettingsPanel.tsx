import { useState } from 'react'
import type { AppSettings, ModelOption } from '@shared/types'
import { EMOTIONS, type SpeechCueSettings } from '@shared/speech-cues'

export function CueSettingsPanel({
  settings,
  onChange
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}) {
  const [draft, setDraft] = useState(settings.speechCues)
  const [key, setKey] = useState(settings.apiKey)
  const [models, setModels] = useState<ModelOption[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const change = (patch: Partial<SpeechCueSettings>) => setDraft((prev) => ({ ...prev, ...patch }))
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save voice settings.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="block cue-settings">
      <span className="eyebrow">VOICE INTELLIGENCE · EXPERIMENTAL</span>
      <h3>More than the words</h3>
      <p className="hint">
        Listen for emotional delivery, monotone speech, emphasis, pace and nonverbal cues. Analysis
        runs only when you request it in Transcript Review, on an excerpt of up to 30 seconds. It
        does not slow live typing.
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        <span>
          Enable paid cloud speech-cue analysis. Requested audio excerpts and my style guidance go
          to OpenRouter and its model provider, even if my speech engine is local. No recordings are
          analyzed automatically.
        </span>
      </label>
      <div className="field">
        <label htmlFor="cue-key">OpenRouter key</label>
        <input
          id="cue-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Uses the same securely saved OpenRouter key as speech"
        />
      </div>
      <div className="field">
        <label htmlFor="cue-model">Audio understanding model</label>
        <input
          id="cue-model"
          list="cue-models"
          value={draft.model}
          maxLength={160}
          onChange={(e) => change({ model: e.target.value })}
        />
        <datalist id="cue-models">
          {models.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </datalist>
      </div>
      <p className="hint">
        Start with google/gemini-2.5-flash-lite. This is an audio chat call, separate from your STT
        slug. Audio is billed differently from text; check the model’s current audio rates. We
        require structured output and a provider route that denies data collection; unavailable
        routes produce an error rather than relaxing that policy.
      </p>
      <button
        className="ghost"
        disabled={busy || !settings.apiKey || key !== settings.apiKey}
        onClick={() =>
          void run(async () => {
            setModels(await window.s2t.fetchCueModels())
            setMessage(
              'Current audio chat models loaded. Choose a slug above. No paid analysis was made.'
            )
          })
        }
      >
        Load compatible models
      </button>
      {key !== settings.apiKey && (
        <p className="hint">Save your key before loading current models.</p>
      )}
      <fieldset>
        <legend>What should it listen for?</legend>
        {(['emotions', 'delivery', 'pacing', 'events'] as const).map((kind, i) => (
          <label className="consent" key={kind}>
            <input
              type="checkbox"
              checked={draft[kind]}
              onChange={(e) => change({ [kind]: e.target.checked })}
            />
            <span>
              {
                [
                  'Emotional delivery',
                  'Delivery: monotone, emphasis, soft or animated',
                  'Pacing: slow, steady, fast or variable',
                  'Nonverbal events: laughter and sighs'
                ][i]
              }
            </span>
          </label>
        ))}
      </fieldset>
      {draft.emotions && (
        <fieldset>
          <legend>Emotion labels to consider</legend>
          <div className="cue-label-picks">
            {EMOTIONS.map((label) => (
              <label key={label}>
                <input
                  type="checkbox"
                  checked={draft.emotionLabels.includes(label)}
                  onChange={(e) =>
                    change({
                      emotionLabels: e.target.checked
                        ? [...draft.emotionLabels, label]
                        : draft.emotionLabels.filter((v) => v !== label)
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="hint">
            No selection means no emotion labels. Neutral can be a useful result; monotone does not
            automatically mean sad.
          </p>
        </fieldset>
      )}
      <label className="consent">
        <input
          type="checkbox"
          checked={draft.clearOnly}
          onChange={(e) => change({ clearOnly: e.target.checked })}
        />
        <span>
          Keep only cues the model describes as clear. This is its assessment, not a measured
          probability.
        </span>
      </label>
      <div className="field">
        <label htmlFor="cue-guidance">Your usual speaking style (optional)</label>
        <textarea
          id="cue-guidance"
          rows={3}
          maxLength={500}
          value={draft.guidance}
          onChange={(e) => change({ guidance: e.target.value })}
          placeholder="For example: my voice is usually quiet and even; please avoid interpreting that alone as sadness."
        />
      </div>
      <p className="hint">
        Guidance accompanies each requested excerpt. Keep it free of private names or secrets.
        Models can misread emotion; review and relabel cues before sharing. Corrections are stored
        per take and do not retrain the model.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await onChange({ speechCues: draft, apiKey: key.trim() })
            setMessage(
              'Voice intelligence saved. Open a retained take in History → Review to test it.'
            )
          })
        }
      >
        {busy ? 'Working…' : 'Save voice intelligence'}
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  )
}
