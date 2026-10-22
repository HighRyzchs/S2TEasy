import {
  overlayTemplate,
  readOverlayTemplate,
  MIC_TEMPLATE,
  TEMPLATE_GUIDE
} from '@shared/overlay-template'
import { useState, type ReactNode } from 'react'
import {
  defaultOverlayTheme,
  hexToHsl,
  hslToHex,
  OVERLAY_SKINS,
  OVERLAY_BEZEL_OPTIONS,
  OVERLAY_CORE_OPTIONS,
  OVERLAY_WAVE_OPTIONS,
  overlayThemeLabel,
  type OverlayTheme
} from '@shared/overlay-theme'
import { useHudPreview } from './useHudPreview'
import { OverlayAssetPicker } from './OverlayAssetPicker'
import { OverlayHud } from './OverlayHud'

export function OverlayThemeEditor({
  theme,
  onChange
}: {
  theme: OverlayTheme
  onChange: (theme: OverlayTheme) => void
}) {
  const [templateError, setTemplateError] = useState('')
  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const demo = useHudPreview(theme.sensitivity)

  const patch = (partial: Partial<OverlayTheme>) => onChange({ ...theme, ...partial })

  return (
    <div className="overlay-editor">
      <p className="hint">
        Choose a look, bring your own image, and test speech volume. Changes apply to your next
        recording.
      </p>
      <div className="picks" aria-label="HUD style">
        {OVERLAY_SKINS.map(({ id: skin, label }) => (
          <button
            key={skin}
            className={theme.skin === skin ? 'on' : ''}
            aria-pressed={theme.skin === skin}
            onClick={() => patch({ skin })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="toggle-row">
        <span>
          Show live transcript<small>Turn off for a smaller, single-line pill</small>
        </span>
        <button
          type="button"
          role="switch"
          className={theme.showTranscript ? 'switch on' : 'switch'}
          aria-label="Show live transcript in HUD"
          aria-checked={theme.showTranscript}
          onClick={() => patch({ showTranscript: !theme.showTranscript })}
        >
          <i />
        </button>
      </div>
      <p className="readout">{overlayThemeLabel(theme)}</p>
      <div
        className="overlay-preview-frame"
        style={{
          minHeight: theme.orientation === 'vertical' ? 320 * theme.scale : 120 * theme.scale
        }}
      >
        {demo.state.status !== 'hidden' && (
          <OverlayHud
            theme={theme}
            bars={demo.bars}
            canStop={['listening', 'transcribing', 'inserting'].includes(demo.state.status)}
            preview
            state={demo.state}
            onStop={demo.stop}
            onDismiss={demo.dismiss}
          />
        )}
        {demo.state.status === 'hidden' && <span className="hint">Preview dismissed</span>}
      </div>
      <div className="inline">
        <button className="ghost" onClick={demo.start}>
          Replay preview
        </button>
        <button className="ghost" onClick={() => void demo.startMic()}>
          Use my microphone
        </button>
        <button className="ghost" onClick={demo.dismiss}>
          End preview
        </button>
      </div>
      <p className="hint">
        {demo.source === 'microphone' && demo.state.status === 'listening'
          ? 'Microphone active. Stop or End preview releases it.'
          : 'Simulated speech. Use your microphone to see your actual volume.'}{' '}
        Preview audio stays on this device.
      </p>
      <label className="tint-label">
        Layout{' '}
        <select
          aria-label="HUD orientation"
          value={theme.orientation}
          onChange={(e) => patch({ orientation: e.target.value as OverlayTheme['orientation'] })}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label className="tint-label">
        Size · {Math.round(theme.scale * 100)}%
        <input
          aria-label="HUD size"
          type="range"
          min="80"
          max="140"
          value={Math.round(theme.scale * 100)}
          onChange={(e) => patch({ scale: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="tint-label">
        Wave sensitivity · {theme.sensitivity.toFixed(1)}×
        <input
          aria-label="Wave sensitivity"
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={theme.sensitivity}
          onChange={(e) => patch({ sensitivity: Number(e.target.value) })}
        />
      </label>
      <div className="grid-2">
        <label className="tint-label">
          Transcript font
          <select
            aria-label="HUD transcript font"
            value={theme.font}
            onChange={(e) => patch({ font: e.target.value as OverlayTheme['font'] })}
          >
            <option value="outfit">Outfit</option>
            <option value="system">System</option>
            <option value="mono">Monospace</option>
            <option value="serif">Serif</option>
          </select>
        </label>
        <label className="tint-label">
          Waveform style
          <select
            aria-label="HUD waveform style"
            value={theme.wave}
            onChange={(e) => patch({ wave: e.target.value as OverlayTheme['wave'] })}
          >
            {OVERLAY_WAVE_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="block">
        <h4>Make it yours. Share the look.</h4>
        <p className="hint">
          Download a theme, a transparent microphone design source, and a guide. Edit the SVG in
          your design app and export PNG/WebP to upload below.
        </p>
        <div className="inline">
          <button
            className="ghost"
            onClick={() => download('overlay.json', overlayTemplate(theme), 'application/json')}
          >
            Download theme template
          </button>
          <button
            className="ghost"
            onClick={() => download('microphone.svg', MIC_TEMPLATE, 'image/svg+xml')}
          >
            Mic design source
          </button>
          <button
            className="ghost"
            onClick={() => download('overlay-guide.txt', TEMPLATE_GUIDE, 'text/plain')}
          >
            Design guide
          </button>
        </div>
        <label className="tint-label">
          Import theme
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setTemplateError('')
              if (file.size > 2_100_000) {
                setTemplateError('Theme file is too large (maximum 2 MB).')
                return
              }
              void file
                .text()
                .then((text) => onChange(readOverlayTemplate(text)))
                .catch((error) =>
                  setTemplateError(
                    error instanceof Error ? error.message : 'Could not import theme.'
                  )
                )
            }}
          />
        </label>
        {templateError && (
          <p className="status-bad" role="alert">
            {templateError}
          </p>
        )}
      </section>
      <OverlayAssetPicker theme={theme} onChange={onChange} />

      {theme.skin !== 'studio' && (
        <label className="tint-label">
          Accent color
          <input
            aria-label="HUD accent color"
            type="color"
            value={hslToHex(theme.waveHue, theme.waveSat, theme.waveLight)}
            onChange={(event) => {
              const { h, s, l } = hexToHsl(event.target.value)
              patch({ waveHue: h, waveSat: s, waveLight: l, coreHue: h, coreSat: s, coreLight: l })
            }}
          />
        </label>
      )}
      {theme.skin === 'studio' && (
        <>
          <ThemeGroup
            title="Circle"
            options={OVERLAY_CORE_OPTIONS}
            value={theme.core}
            onPick={(core) => patch({ core })}
            hue={theme.coreHue}
            color={hslToHex(theme.coreHue, theme.coreSat, theme.coreLight)}
            onHue={(coreHue) => patch({ coreHue })}
            onColor={(hex) => {
              const next = hexToHsl(hex)
              patch({ coreHue: next.h, coreSat: next.s, coreLight: next.l })
            }}
          />
          <ThemeGroup
            title="Waveform"
            options={OVERLAY_WAVE_OPTIONS}
            value={theme.wave}
            onPick={(wave) => patch({ wave })}
            hue={theme.waveHue}
            color={hslToHex(theme.waveHue, theme.waveSat, theme.waveLight)}
            onHue={(waveHue) => patch({ waveHue })}
            onColor={(hex) => {
              const next = hexToHsl(hex)
              patch({ waveHue: next.h, waveSat: next.s, waveLight: next.l })
            }}
          />
          <ThemeGroup
            title="Bezel"
            options={OVERLAY_BEZEL_OPTIONS}
            value={theme.bezel}
            onPick={(bezel) => patch({ bezel })}
            hue={theme.bezelHue}
            color={hslToHex(theme.bezelHue, theme.bezelSat, theme.bezelLight)}
            onHue={(bezelHue) => patch({ bezelHue })}
            onColor={(hex) => {
              const next = hexToHsl(hex)
              patch({ bezelHue: next.h, bezelSat: next.s, bezelLight: next.l })
            }}
          >
            <label className="tint-label">
              Opacity
              <input
                type="range"
                min={12}
                max={62}
                value={Math.round(theme.bezelAlpha * 100)}
                onChange={(event) => patch({ bezelAlpha: Number(event.target.value) / 100 })}
              />
            </label>
          </ThemeGroup>
        </>
      )}
      <button type="button" className="ghost" onClick={() => onChange(defaultOverlayTheme())}>
        Reset to Ink
      </button>
    </div>
  )
}

function ThemeGroup<T extends string>({
  title,
  options,
  value,
  onPick,
  hue,
  color,
  onHue,
  onColor,
  children
}: {
  title: string
  options: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
  hue: number
  color: string
  onHue: (hue: number) => void
  onColor: (hex: string) => void
  children?: ReactNode
}) {
  return (
    <div className="theme-group">
      <div className="theme-group-head">
        <h4>{title}</h4>
        <div className="tint">
          <input
            type="color"
            value={color}
            onChange={(event) => onColor(event.target.value)}
            aria-label={`${title} color`}
          />
          <label className="tint-label">
            Hue
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(event) => onHue(Number(event.target.value))}
            />
          </label>
          {children}
        </div>
      </div>
      <div className="picks">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'on' : ''}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
