import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { MicPreview } from '../../lib/mic'
import { errorMessage, useApp } from '../context'
import { Section, Toggle, useSave } from './controls'

const PROCESSING = [
  ['noiseSuppression', 'Noise suppression', 'Quiets steady background noise such as fans.'],
  ['voiceIsolation', 'Voice isolation', 'Focuses on your voice, when Windows and the microphone offer it.'],
  ['echoCancellation', 'Echo cancellation', 'Stops speaker sound from coming back in. Helpful without headphones.'],
  ['autoGainControl', 'Automatic gain', 'Evens out loud and quiet speech. Turn off if your voice sounds pumped.']
] as const

const TAILS = [
  [0, 'Off, stop immediately'],
  [300, '0.3 seconds'],
  [500, '0.5 seconds'],
  [600, '0.6 seconds (recommended)'],
  [1000, '1 second'],
  [1500, '1.5 seconds']
] as const

export function MicSection() {
  const { settings } = useApp()
  const quickSave = useSave()
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => setMics(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => undefined)
  }, [])
  return (
    <Section id="mic" title="Microphone" intro="Start with the system default and change things only if it sounds wrong.">
      <div className="set-fields">
        <div className="field">
          <label htmlFor="microphone">Input</label>
          <select
            id="microphone"
            className="select"
            value={settings.microphoneId}
            onChange={(e) => quickSave({ microphoneId: e.target.value })}
          >
            <option value="">System default</option>
            {mics
              .filter((mic) => mic.deviceId && mic.deviceId !== 'default')
              .map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || 'Microphone'}
                </option>
              ))}
          </select>
        </div>
        <LevelTest settings={settings} />
      </div>
      <div className="set-lines">
        {PROCESSING.map(([key, label, hint]) => (
          <Toggle
            key={key}
            label={label}
            hint={hint}
            checked={settings[key]}
            onChange={(on) => quickSave({ [key]: on })}
          />
        ))}
        <label className="line" htmlFor="gain">
          <span>
            <span>Input boost</span>
            <span className="hint">Makes a quiet microphone louder. Applies to the test above too.</span>
          </span>
          <span className="set-range">
            <input
              id="gain"
              type="range"
              min={0.5}
              max={2.4}
              step={0.05}
              value={settings.inputGain}
              onChange={(e) => quickSave({ inputGain: Number(e.target.value) })}
            />
            <span className="mono dim">{settings.inputGain.toFixed(2)}×</span>
          </span>
        </label>
        {settings.sttEngine === 'router-audio' ? (
          <div className="line">
            <span>
              <span>Pause detection</span>
              <span className="hint">
                The streaming engine decides where you paused, so there is nothing to set. Switch
                engines to change it.
              </span>
            </span>
          </div>
        ) : (
          <label className="line" htmlFor="vad">
            <span>
              <span>Pause detection</span>
              <span className="hint">How long a gap ends a phrase, so it can be typed.</span>
            </span>
            <select
              id="vad"
              className="select set-narrow"
              value={settings.vadSensitivity}
              onChange={(e) =>
                quickSave({ vadSensitivity: e.target.value as AppSettings['vadSensitivity'] })
              }
            >
              <option value="low">Wait for longer pauses</option>
              <option value="medium">Balanced</option>
              <option value="high">React to shorter pauses</option>
            </select>
          </label>
        )}
        <label className="line" htmlFor="capture-tail">
          <span>
            <span>Keep listening after Stop</span>
            <span className="hint">
              Leaves the microphone open briefly so the last word is not cut off. Cancel always
              stops at once.
            </span>
          </span>
          <select
            id="capture-tail"
            className="select set-narrow"
            value={settings.captureTailMs}
            onChange={(e) => quickSave({ captureTailMs: Number(e.target.value) })}
          >
            {TAILS.map(([ms, label]) => (
              <option key={ms} value={ms}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Section>
  )
}

function LevelTest({ settings }: { settings: AppSettings }) {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const preview = useRef(new MicPreview())
  useEffect(() => {
    const current = preview.current
    return () => {
      void current.stop()
    }
  }, [])
  const toggle = async () => {
    try {
      if (listening) {
        await preview.current.stop()
        setListening(false)
        setLevel(0)
      } else {
        setError('')
        await preview.current.start(settings, setLevel)
        setListening(true)
      }
    } catch (e) {
      setListening(false)
      setError(errorMessage(e))
    }
  }
  const percent = Math.min(100, Math.round(level * 420))
  return (
    <div className="field">
      <span id="level-label">Input level</span>
      <div className="set-meter-row">
        <div
          className="set-meter"
          role="meter"
          aria-labelledby="level-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <button type="button" className="btn" onClick={() => void toggle()}>
          {listening ? 'Stop test' : 'Test microphone'}
        </button>
      </div>
      {error ? (
        <span className="set-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="hint">
          {listening ? 'Say something. The bar should move without hitting the end.' : 'Nothing is recorded or saved during the test.'}
        </span>
      )}
    </div>
  )
}
