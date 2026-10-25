import { useState } from 'react'
import { describeTidy, tidySpeech, type TidySettings } from '@shared/tidy'
import { useApp } from '../context'
import { Section, Toggle, useSave } from './controls'

const SAMPLE =
  'Um, I I want to go to the store, I mean the mall. That would, that would be great because I went to the. Store was closed.'

/** Speech tidy: what it takes out, whether it runs by itself, and a box to try it on your own words. */
export function TidySection() {
  const { settings } = useApp()
  const quickSave = useSave()
  const tidy = settings.tidy
  const set = (patch: Partial<TidySettings>) => quickSave({ tidy: { ...tidy, ...patch } })
  const [sample, setSample] = useState(SAMPLE)
  const result = tidySpeech(sample, tidy, settings.vocabulary.filter((e) => e.enabled).map((e) => e.meant))

  return (
    <Section
      id="tidy"
      title="Speech tidy"
      intro="Takes the stumbles out of what you said and keeps your own words. It does not reword or polish."
    >
      <Toggle
        label="Tidy every take"
        hint={
          settings.insertMode === 'live'
            ? 'Each piece is tidied as it is typed, and the whole take once more at the end. The HUD’s Tidy button works either way.'
            : 'Before the text goes into your app. The HUD’s Tidy button works either way.'
        }
        checked={tidy.auto}
        onChange={(auto) => set({ auto })}
      />
      <Toggle
        label="Stutters"
        hint="“I I want”, “th- the”, “to the, to the store”"
        checked={tidy.stutters}
        onChange={(stutters) => set({ stutters })}
      />
      <Toggle label="Fillers" hint="um, uh, erm" checked={tidy.fillers} onChange={(fillers) => set({ fillers })} />
      <Toggle
        label="Corrections"
        hint="“the store, I mean the mall” → “the mall”. Also “no wait”, “sorry”, “scratch that”, and a short start you say again."
        checked={tidy.corrections}
        onChange={(corrections) => set({ corrections })}
      />
      <Toggle
        label="Pause breaks"
        hint="A full stop and capital put in where you paused mid-thought: “I went to the. Store” → “I went to the store”."
        checked={tidy.pauseBreaks}
        onChange={(pauseBreaks) => set({ pauseBreaks })}
      />
      <label className="set-tidy-try">
        <span>Try it on something you said</span>
        <textarea value={sample} rows={3} onChange={(event) => setSample(event.target.value)} spellCheck={false} />
      </label>
      <div className="set-tidy-out" aria-live="polite">
        <p>{result.text || '—'}</p>
        <span className="hint">{result.changes.length ? `Took out ${describeTidy(result.changes)}.` : 'Nothing to take out.'}</span>
      </div>
    </Section>
  )
}
