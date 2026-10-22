export const OVERLAY_CORES = ['iris', 'dual', 'radar', 'breathe', 'led', 'comet'] as const
export const OVERLAY_WAVES = ['ribbon', 'filaments', 'columns', 'needles', 'mirror'] as const
export const OVERLAY_BEZELS = ['ribbon', 'glass', 'amber', 'holo', 'ghost'] as const

export type OverlayCore = (typeof OVERLAY_CORES)[number]
export type OverlayWave = (typeof OVERLAY_WAVES)[number]
export type OverlayBezel = (typeof OVERLAY_BEZELS)[number]

export type OverlayTheme = {
  skin: 'minimal' | 'frost' | 'studio'
  showTranscript: boolean
  core: OverlayCore
  wave: OverlayWave
  bezel: OverlayBezel
  coreHue: number
  coreSat: number
  coreLight: number
  waveHue: number
  waveSat: number
  waveLight: number
  bezelHue: number
  bezelSat: number
  bezelLight: number
  bezelAlpha: number
}

export const OVERLAY_CORE_OPTIONS: { id: OverlayCore; label: string }[] = [
  { id: 'iris', label: 'Iris' },
  { id: 'dual', label: 'Dual orbit' },
  { id: 'radar', label: 'Radar' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'led', label: 'LED' },
  { id: 'comet', label: 'Comet orb' }
]

export const OVERLAY_WAVE_OPTIONS: { id: OverlayWave; label: string }[] = [
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'filaments', label: 'Filaments' },
  { id: 'columns', label: 'Columns' },
  { id: 'needles', label: 'Needles' },
  { id: 'mirror', label: 'Mirror' }
]

export const OVERLAY_BEZEL_OPTIONS: { id: OverlayBezel; label: string }[] = [
  { id: 'ribbon', label: 'Signal Ribbon' },
  { id: 'glass', label: 'Neon Glass' },
  { id: 'amber', label: 'Amber Drift' },
  { id: 'holo', label: 'Holoplate' },
  { id: 'ghost', label: 'Ghost' }
]

/** Ink is the default; Studio mixer fields remain available for customization. */
export function defaultOverlayTheme(): OverlayTheme {
  return {
    skin: 'minimal',
    showTranscript: true,
    core: 'iris',
    wave: 'ribbon',
    bezel: 'ribbon',
    coreHue: 158,
    coreSat: 55,
    coreLight: 77,
    waveHue: 158,
    waveSat: 55,
    waveLight: 77,
    bezelHue: 268,
    bezelSat: 70,
    bezelLight: 72,
    bezelAlpha: 0.34
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function clampHue(value: number): number {
  if (!Number.isFinite(value)) return 0
  const wrapped = ((Math.round(value) % 360) + 360) % 360
  return wrapped
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

export function normalizeOverlayTheme(raw?: Partial<OverlayTheme> | null): OverlayTheme {
  const fallback = defaultOverlayTheme()
  const next = { ...fallback, ...(raw ?? {}) }
  return {
    skin: oneOf(next.skin, ['minimal', 'frost', 'studio'] as const, fallback.skin),
    showTranscript: next.showTranscript !== false,
    core: oneOf(next.core, OVERLAY_CORES, fallback.core),
    wave: oneOf(next.wave, OVERLAY_WAVES, fallback.wave),
    bezel: oneOf(next.bezel, OVERLAY_BEZELS, fallback.bezel),
    coreHue: clampHue(next.coreHue),
    coreSat: clamp(next.coreSat, 0, 100),
    coreLight: clamp(next.coreLight, 8, 96),
    waveHue: clampHue(next.waveHue),
    waveSat: clamp(next.waveSat, 0, 100),
    waveLight: clamp(next.waveLight, 8, 96),
    bezelHue: clampHue(next.bezelHue),
    bezelSat: clamp(next.bezelSat, 0, 100),
    bezelLight: clamp(next.bezelLight, 8, 96),
    bezelAlpha: clamp(Number(next.bezelAlpha), 0.12, 0.62)
  }
}

export function overlayThemeVars(theme: OverlayTheme): Record<string, string> {
  return {
    '--core-h': String(theme.coreHue),
    '--core-s': `${theme.coreSat}%`,
    '--core-l': `${theme.coreLight}%`,
    '--wave-h': String(theme.waveHue),
    '--wave-s': `${theme.waveSat}%`,
    '--wave-l': `${theme.waveLight}%`,
    '--bezel-h': String(theme.bezelHue),
    '--bezel-s': `${theme.bezelSat}%`,
    '--bezel-l': `${theme.bezelLight}%`,
    '--bezel-alpha': String(theme.bezelAlpha)
  }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = clamp(s, 0, 100) / 100
  const lit = clamp(l, 0, 100) / 100
  const a = sat * Math.min(lit, 1 - lit)
  const f = (n: number) => {
    const k = (n + clampHue(h) / 30) % 12
    const color = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (!match?.[1]) return { h: 0, s: 0, l: 50 }
  const r = Number.parseInt(match[1].slice(0, 2), 16) / 255
  const g = Number.parseInt(match[1].slice(2, 4), 16) / 255
  const b = Number.parseInt(match[1].slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function overlayThemeLabel(theme: OverlayTheme): string {
  if (theme.skin !== 'studio')
    return `${theme.skin === 'frost' ? 'Frost' : 'Ink'} · ${theme.showTranscript ? 'Live transcript' : 'Compact'}`
  const core = OVERLAY_CORE_OPTIONS.find((item) => item.id === theme.core)?.label ?? theme.core
  const wave = OVERLAY_WAVE_OPTIONS.find((item) => item.id === theme.wave)?.label ?? theme.wave
  const bezel = OVERLAY_BEZEL_OPTIONS.find((item) => item.id === theme.bezel)?.label ?? theme.bezel
  return `${core} · ${wave} · ${bezel}`
}
