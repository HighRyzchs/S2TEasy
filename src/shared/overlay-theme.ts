export const OVERLAY_CORES = ['iris', 'dual', 'radar', 'breathe', 'led', 'comet'] as const
export const OVERLAY_WAVES = ['ribbon', 'filaments', 'columns', 'needles', 'mirror'] as const
export const OVERLAY_BEZELS = ['ribbon', 'glass', 'amber', 'holo', 'ghost'] as const

export type OverlayCore = (typeof OVERLAY_CORES)[number]
export type OverlayWave = (typeof OVERLAY_WAVES)[number]
export type OverlayBezel = (typeof OVERLAY_BEZELS)[number]

export const OVERLAY_SKINS = [
  { id: 'minimal', label: 'Ink' },
  { id: 'frost', label: 'Frost' },
  { id: 'glass', label: 'Liquid Glass' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'pixel', label: '8-bit' },
  { id: 'studio', label: 'Studio' }
] as const

export type OverlayTheme = {
  font: 'outfit' | 'system' | 'mono' | 'serif'
  skin: (typeof OVERLAY_SKINS)[number]['id']
  orientation: 'horizontal' | 'vertical'
  scale: number
  sensitivity: number
  assetDataUrl: string
  assetRole: 'emblem' | 'background'
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
    font: 'outfit',
    skin: 'minimal',
    orientation: 'horizontal',
    scale: 1,
    sensitivity: 1,
    assetDataUrl: '',
    assetRole: 'emblem',
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
    font: oneOf(next.font, ['outfit', 'system', 'mono', 'serif'] as const, 'outfit'),
    skin: oneOf(
      next.skin,
      OVERLAY_SKINS.map((skin) => skin.id),
      fallback.skin
    ),
    orientation: oneOf(next.orientation, ['horizontal', 'vertical'] as const, 'horizontal'),
    scale: clamp(Number(next.scale), 0.8, 1.4),
    sensitivity: clamp(Number(next.sensitivity), 0.5, 3),
    assetDataUrl: validOverlayAsset(next.assetDataUrl) ? next.assetDataUrl : '',
    assetRole: next.assetRole === 'background' ? 'background' : 'emblem',
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
    '--hud-font': {
      outfit: '"Outfit Variable", Outfit, system-ui, sans-serif',
      system: 'system-ui, sans-serif',
      mono: 'Consolas, monospace',
      serif: 'Georgia, serif'
    }[theme.font],
    '--overlay-scale': String(theme.scale),
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
    return `${OVERLAY_SKINS.find((skin) => skin.id === theme.skin)?.label ?? 'Ink'} · ${theme.showTranscript ? 'Live transcript' : 'Compact'}`
  const core = OVERLAY_CORE_OPTIONS.find((item) => item.id === theme.core)?.label ?? theme.core
  const wave = OVERLAY_WAVE_OPTIONS.find((item) => item.id === theme.wave)?.label ?? theme.wave
  const bezel = OVERLAY_BEZEL_OPTIONS.find((item) => item.id === theme.bezel)?.label ?? theme.bezel
  return `${core} · ${wave} · ${bezel}`
}

/** Only bounded raster data is embedded in saved themes. No file paths, URLs or SVG markup. */
export function validOverlayAsset(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2_000_000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
}
