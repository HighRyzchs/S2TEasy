import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WAVEFORM_BARS } from '@shared/constants'
import {
  defaultOverlayTheme,
  hexToHsl,
  hslToHex,
  OVERLAY_BEZEL_OPTIONS,
  OVERLAY_CORE_OPTIONS,
  OVERLAY_WAVE_OPTIONS,
  overlayThemeLabel,
  type OverlayTheme
} from '@shared/overlay-theme'
import { composeOverlayBars, previewTarget } from '@shared/waveform'
import { OverlayHud } from './OverlayHud'

export function OverlayThemeEditor({
  theme,
  onChange
}: {
  theme: OverlayTheme
  onChange: (theme: OverlayTheme) => void
}) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: WAVEFORM_BARS }, () => 0.12))
  const currentRef = useRef(bars)

  useEffect(() => {
    let frame = 0
    let t = 0
    const tick = () => {
      t += 0.016
      const next = composeOverlayBars({
        status: 'listening',
        target: previewTarget(t),
        current: currentRef.current,
        t,
        rms: 0.07 + 0.025 * Math.sin(t * 1.15)
      })
      currentRef.current = next
      setBars(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const patch = (partial: Partial<OverlayTheme>) => onChange({ ...theme, ...partial })

  return (
    <div className="overlay-editor">
      <p className="hint">
        Circle, waveform, and bezel are separate. Changes apply to the live recording HUD immediately.
      </p>
      <p className="readout">{overlayThemeLabel(theme)}</p>
      <div className="overlay-preview-frame">
        <OverlayHud
          theme={theme}
          bars={bars}
          canStop
          preview
          state={{
            status: 'listening',
            partial: 'Speak into any text field…',
            message: 'Listening',
            rms: 0.08,
            elapsedMs: 4200,
            bars: []
          }}
        />
      </div>

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
      <button type="button" className="ghost" onClick={() => onChange(defaultOverlayTheme())}>
        Reset to Iris · Ribbon · Signal Ribbon
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
          <input type="color" value={color} onChange={(event) => onColor(event.target.value)} aria-label={`${title} color`} />
          <label className="tint-label">
            Hue
            <input type="range" min={0} max={360} value={hue} onChange={(event) => onHue(Number(event.target.value))} />
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
