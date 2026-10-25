import { useState } from 'react'
import {
  applyCommands,
  renderStructure,
  STRUCTURE_ACTIONS,
  validPhrase,
  type StructureAction,
  type StructureSettings
} from '@shared/structure'
import { useApp } from '../context'
import { Section, Toggle, useSave } from '../settings/controls'
import { TidySection } from './TidySection'
import '../settings/settings.css'

const SAMPLE = 'Here is the plan. New paragraph. Bullet point call the venue. Bullet point book the band. New line. Thanks, Rozay'

/** Voice commands that structure the text, and what you say for each. */
function CommandsSection() {
  const { settings } = useApp()
  const quickSave = useSave()
  const prefs = settings.structure
  const set = (patch: Partial<StructureSettings>) => quickSave({ structure: { ...prefs, ...patch } })
  const setPhrases = (action: StructureAction, phrases: string[]) => set({ phrases: { ...prefs.phrases, [action]: phrases } })
  const [adding, setAdding] = useState<Record<string, string>>({})
  const [sample, setSample] = useState(SAMPLE)
  const shown = renderStructure(applyCommands(sample, prefs).text)

  return (
    <Section
      id="commands"
      title="Voice commands"
      intro="Say a command on its own, between sentences, and it shapes the text instead of being typed. “I started a new paragraph today” stays words."
    >
      <Toggle label="Listen for structure commands" checked={prefs.enabled} onChange={(enabled) => set({ enabled })} />
      {STRUCTURE_ACTIONS.map(({ action, label, marker, hint }) => {
        const draft = adding[action] ?? ''
        const add = () => {
          if (!validPhrase(draft)) return
          setPhrases(action, [...new Set([...prefs.phrases[action], draft.trim().toLowerCase()])])
          setAdding({ ...adding, [action]: '' })
        }
        return (
          <div className="cmd-row" key={action}>
            <div className="cmd-head">
              <span className="cmd-mark" aria-hidden>
                {marker}
              </span>
              <span>
                <strong>{label}</strong>
                <span className="hint">{hint}</span>
              </span>
            </div>
            <div className="cmd-phrases" aria-label={`What you say for ${label}`}>
              {prefs.phrases[action].map((phrase) => (
                <span className="cmd-chip" key={phrase}>
                  “{phrase}”
                  <button
                    type="button"
                    aria-label={`Remove “${phrase}”`}
                    onClick={() => setPhrases(action, prefs.phrases[action].filter((p) => p !== phrase))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="cmd-add">
                <input
                  className="input"
                  value={draft}
                  placeholder="Add a phrase"
                  aria-label={`Add a phrase for ${label}`}
                  onChange={(event) => setAdding({ ...adding, [action]: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') add()
                  }}
                />
                <button type="button" className="btn" disabled={!validPhrase(draft)} onClick={add}>
                  Add
                </button>
              </span>
            </div>
          </div>
        )
      })}
      <p className="hint">A phrase needs two words or more, so a single word you say in passing never turns into a line break.</p>
      <label className="set-tidy-try">
        <span>Try it on something you said</span>
        <textarea value={sample} rows={3} onChange={(event) => setSample(event.target.value)} spellCheck={false} />
      </label>
      <div className="set-tidy-out cmd-out" aria-live="polite">
        <p>{shown.trim() || '—'}</p>
      </div>
    </Section>
  )
}

/** Your voice → Structure: voice commands and speech tidy, both about how your words come out. */
export function StructureTab() {
  return (
    <div className="structure-tab">
      <CommandsSection />
      <TidySection />
    </div>
  )
}
