import { useApp } from '../context'
import { Section, Toggle, useSave } from './controls'

const DAYS = [1, 3, 7, 14, 30]

export function PrivacySection() {
  const { settings } = useApp()
  const quickSave = useSave()
  return (
    <Section
      id="privacy"
      title="Privacy & data"
      intro="Your history, words and kept audio are stored on this PC. Audio only leaves it for the speech engine you chose, while you dictate."
    >
      <div className="set-lines">
        <Toggle
          label="Keep audio until the text is safely typed"
          hint="So a dropped connection never loses what you said. Deleted after the text is typed, unless a take failed or you keep clips below."
          checked={settings.recoveryAudio}
          onChange={(recoveryAudio) => quickSave({ recoveryAudio })}
        />
        <label className="line" htmlFor="retention">
          <span>
            <span>Delete kept audio after</span>
            <span className="hint">Failed takes stay until they expire or you delete them.</span>
          </span>
          <select
            id="retention"
            className="select set-narrow"
            value={settings.audioRetentionDays}
            onChange={(e) => quickSave({ audioRetentionDays: Number(e.target.value) })}
          >
            {DAYS.map((days) => (
              <option key={days} value={days}>
                {days} {days === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Keep clips of your words for Your voice"
          hint="Keeps the audio of each successful take on this PC, so Your voice can replay the moment you said a word. Nothing is uploaded and no model is trained."
          checked={settings.keepAudioForTraining}
          onChange={(keepAudioForTraining) => quickSave({ keepAudioForTraining })}
        />
      </div>
      <p className="hint">
        Deleting a History entry deletes its kept audio. API keys use Windows encryption when
        available; transcripts and audio files are not encrypted by the app.
      </p>
    </Section>
  )
}
