import type { OverlayTheme } from './overlay-theme'

export const HUD_STYLES = [
  { id: 'island', label: 'Island', accent: '#a5e6ce' },
  { id: 'caption', label: 'Caption', accent: '#ffd166' },
  { id: 'edge', label: 'Edge glow', accent: '#a5e6ce' },
  { id: 'cyber', label: 'Cyberpunk', accent: '#00f0ff' },
  { id: 'pixel', label: '8-bit', accent: '#e60012' },
  { id: 'ghost', label: 'Ghost text', accent: '#1f8a6a' },
  { id: 'balloon', label: 'Speech balloon', accent: '#e63946' }
] as const

export type HudStyle = (typeof HUD_STYLES)[number]['id']

export type HudSettings = {
  style: HudStyle
  /** Hex color used for highlights, fixed words and the main button. */
  accent: string
  /** 0.8 to 1.4. */
  scale: number
  /** While talking: one rolling line, or the whole draft. Pausing always opens the full editor. */
  whileTalking: 'compact' | 'full'
  /** Show the speech cues switch on the HUD. */
  showCues: boolean
  /** Clicking your words opens the editor while you keep talking. */
  clickToEdit: boolean
  /** Waveform sensitivity, 0.5 to 2. */
  sensitivity: number
}

const STYLE_IDS: readonly string[] = HUD_STYLES.map((style) => style.id)

export function hudAccent(style: HudStyle): string {
  return HUD_STYLES.find((row) => row.id === style)?.accent ?? '#a5e6ce'
}

/** Earlier HUD skins map onto the closest new style. */
function styleFromLegacy(theme?: Partial<OverlayTheme> | null): HudStyle {
  if (theme?.skin === 'cyberpunk') return 'cyber'
  if (theme?.skin === 'pixel') return 'pixel'
  return 'island'
}

export function defaultHudSettings(legacy?: Partial<OverlayTheme> | null): HudSettings {
  const style = styleFromLegacy(legacy)
  return {
    style,
    accent: hudAccent(style),
    scale: clamp(legacy?.scale, 0.8, 1.4, 1),
    whileTalking: 'compact',
    showCues: true,
    clickToEdit: true,
    sensitivity: clamp(legacy?.sensitivity, 0.5, 2, 1)
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 20) / 20))
    : fallback
}

export function normalizeHudSettings(
  raw?: Partial<HudSettings> | null,
  legacy?: Partial<OverlayTheme> | null
): HudSettings {
  const base = defaultHudSettings(legacy)
  if (!raw || typeof raw !== 'object') return base
  const style = STYLE_IDS.includes(raw.style as string) ? (raw.style as HudStyle) : base.style
  return {
    style,
    accent:
      typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)
        ? raw.accent.toLowerCase()
        : hudAccent(style),
    scale: clamp(raw.scale, 0.8, 1.4, base.scale),
    whileTalking: raw.whileTalking === 'full' ? 'full' : 'compact',
    showCues: raw.showCues !== false,
    clickToEdit: raw.clickToEdit !== false,
    sensitivity: clamp(raw.sensitivity, 0.5, 2, base.sensitivity)
  }
}

/**
 * The HUD window is a fixed transparent stage the HUD draws into, so it can grow into its editor
 * without moving or resizing the window mid-animation. Clicks pass through everywhere except the
 * HUD itself. Edge glow spans the whole width of the display.
 */
export function hudWindowSize(hud: HudSettings, displayWidth: number): { width: number; height: number } {
  const height = Math.round(460 * hud.scale)
  if (hud.style === 'edge') return { width: Math.round(displayWidth), height }
  return { width: Math.min(Math.round(displayWidth), Math.round(780 * hud.scale)), height }
}
