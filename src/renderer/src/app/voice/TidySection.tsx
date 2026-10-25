import { useState } from 'react'
import { describeTidy, MIXED_LANGUAGES, tidySpeech, type LanguageCode, type TidySettings } from '@shared/tidy'
import { useApp } from '../context'
import { Section, Toggle, useSave } from '../settings/controls'
import '../settings/settings.css'

const SAMPLE =
  'Um, I I want to go to the store, I mean the mall. That would, that would be great because I went to the. Screen was frozen.'

/** Speech tidy: what it takes out, whether it runs by itself, and a box to try it on your own words. */
export function TidySection() {
  const { settings } = useApp()
  const quickSave = useSave()
  const tidy = settings.tidy
  const set = (patch: Partial<TidySettings>) => quickSave({ tidy: { ...tidy, ...patch } })
  const [sample, setSample] = useState(SAMPLE)
  const [doubles, setDoubles] = useState(tidy.keepDoubles.join(', '))
  const language = (code: LanguageCode) => tidy.languages.find((l) => l.code === code)
  const setLanguage = (code: LanguageCode, on: boolean, script: 'latin' | 'native' = 'latin') =>
    set({
      languages: on
        ? [...tidy.languages.filter((l) => l.code !== code), { code, script }]
        : tidy.languages.filter((l) => l.code !== code)
    })
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
      <div className="set-tidy-langs" role="group" aria-labelledby="tidy-langs-h">
        <span id="tidy-langs-h">Other languages you mix in</span>
        <span className="hint">
          Words they say twice on purpose (“araw araw”, “yalla yalla”) are then never taken for stutters, and
          speech engines that take a written hint are told you mix them in.
        </span>
        {MIXED_LANGUAGES.map((l) => {
          const chosen = language(l.code)
          return (
            <div className="line" key={l.code}>
              <Toggle label={l.name} checked={!!chosen} onChange={(on) => setLanguage(l.code, on, chosen?.script)} />
              {chosen && l.native && (
                <select
                  aria-label={`How to write ${l.name} words`}
                  value={chosen.script}
                  onChange={(event) => setLanguage(l.code, true, event.target.value as 'latin' | 'native')}
                >
                  <option value="latin">In English letters (as heard)</option>
                  <option value="native">In {l.native}</option>
                </select>
              )}
            </div>
          )
        })}
        {tidy.languages.length > 0 && (
          <Toggle
            label={
              <>
                Live engine: listen for them too <span className="pill off">Experimental</span>
              </>
            }
            hint={
              settings.sttEngine === 'router-audio' && settings.routerProvider === 'deepgram'
                ? 'Asks Deepgram to listen for English mixed with these languages (code-switching). router.audio may ignore or reject it; turn it off if dictation stops working.'
                : 'Needs the live engine with Deepgram as the provider (Settings → Speech engine). Other engines are told in writing where they can be.'
            }
            checked={settings.streamMixedLanguages}
            disabled={!(settings.sttEngine === 'router-audio' && settings.routerProvider === 'deepgram')}
            onChange={(streamMixedLanguages) => quickSave({ streamMixedLanguages })}
          />
        )}
      </div>
      <label className="set-tidy-try">
        <span>Your own words said twice on purpose</span>
        <input
          className="input"
          type="text"
          value={doubles}
          placeholder="Bora Bora, Kiki"
          onChange={(event) => setDoubles(event.target.value)}
          onBlur={() =>
            set({
              keepDoubles: doubles
                .split(',')
                .map((w) => w.trim())
                .filter(Boolean)
            })
          }
        />
      </label>
      <label className="set-tidy-try">
        <span>Try it on something you said</span>
        <textarea value={sample} rows={3} onChange={(event) => setSample(event.target.value)} spellCheck={false} />
      </label>
      <div className="set-tidy-out" aria-live="polite">
        <p>{result.text || '—'}</p>
        <span className="hint">{result.changes.length ? `Tidied: ${describeTidy(result.changes)}.` : 'Nothing to take out.'}</span>
      </div>
    </Section>
  )
}
