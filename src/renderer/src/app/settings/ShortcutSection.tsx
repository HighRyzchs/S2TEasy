import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { errorMessage, useApp } from '../context'
import { Section, Toggle, useSave } from './controls'
import { captureHotkey, hotkeyKeys } from './hotkey-capture'

export function ShortcutSection() {
  const { settings, save, navigate } = useApp()
  const quickSave = useSave()
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!capturing) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const result = captureHotkey(event)
      if (result.kind === 'ignore') return
      if (result.kind === 'cancel') {
        setCapturing(false)
        setMessage('')
      } else if (result.kind === 'invalid') {
        setMessage(result.message)
      } else {
        setCapturing(false)
        setMessage('')
        save({ hotkey: result.accelerator }).catch((e) => setMessage(errorMessage(e)))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, save])

  const delay = Math.round(settings.finishAfterMs / 100) / 10
  return (
    <Section
      id="shortcut"
      title="Shortcut"
      intro="Works in any app: click into a text field, use the shortcut, and speak."
    >
      <div className="line set-shortcut">
        <span>
          {capturing ? (
            <span className="set-capturing">Press the new combination, or Esc to cancel</span>
          ) : (
            <span className="set-keys" aria-label={`Current shortcut: ${hotkeyKeys(settings.hotkey).join(' plus ')}`}>
              {hotkeyKeys(settings.hotkey).map((key) => (
                <kbd key={key} className="kbd">
                  {key}
                </kbd>
              ))}
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setMessage('')
            setCapturing(!capturing)
          }}
        >
          {capturing ? 'Cancel' : 'Change'}
        </button>
      </div>
      {message && (
        <p className="set-error" role="alert">
          {message}
        </p>
      )}
      <div className="line">
        <span>
          <span id="hotkey-mode-label">When you use it</span>
          <span className="hint">
            {settings.hotkeyMode === 'hold'
              ? 'Talk while you hold the keys. Letting go pauses.'
              : 'Press once to start and again to pause.'}
          </span>
        </span>
        <div className="seg" role="group" aria-labelledby="hotkey-mode-label">
          {(
            [
              ['toggle', 'Press'],
              ['hold', 'Hold']
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={settings.hotkeyMode === mode}
              onClick={() => quickSave({ hotkeyMode: mode as AppSettings['hotkeyMode'] })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        Pausing does not end the session. A paused session finishes by itself after the delay set
        on the HUD page (now {delay} seconds), unless you keep using the HUD.
      </p>
      <div className="line">
        <span>
          <span>Typing, finish timer and the HUD itself</span>
        </span>
        <button type="button" className="link" onClick={() => navigate('hud')}>
          HUD settings
        </button>
      </div>
      <Toggle
        label="Launch at Windows startup"
        hint="Starts S2Teasy quietly in the tray so the shortcut is ready."
        checked={settings.launchAtStartup}
        onChange={(launchAtStartup) => quickSave({ launchAtStartup })}
      />
    </Section>
  )
}
