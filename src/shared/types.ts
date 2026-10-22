import { defaultOverlayTheme, normalizeOverlayTheme, type OverlayTheme } from './overlay-theme'
import { normalizeVocabulary, type VocabularyEntry } from './vocabulary'

export type { OverlayTheme }

export type InsertMode = 'live' | 'final'
export type HotkeyMode = 'toggle' | 'hold'
export type SttEngine = 'router-audio' | 'openrouter' | 'local'
export type OpenRouterRoute = 'auto' | 'transcription' | 'chat'
export const OVERLAY_POSITIONS = [
  'bottom',
  'top',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left',
  'right',
  'center'
] as const
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number]
export type VadSensitivity = 'low' | 'medium' | 'high'

export const ROUTER_PROVIDERS = [
  'auto',
  'deepgram',
  'assemblyai',
  'gladia',
  'soniox',
  'speechmatics',
  'openai'
] as const

export type RouterProvider = (typeof ROUTER_PROVIDERS)[number]

export type Packaging = 'portable' | 'installed' | 'dev'

export type UpdatePhase =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

export type UpdateStatus = {
  phase: UpdatePhase
  currentVersion: string
  availableVersion: string
  percent: number
  message: string
  packaging: Packaging
}

export type AppState = {
  settings: AppSettings
  history: HistoryItem[]
  version: string
  update: UpdateStatus
  overlay?: OverlayState
}

export type AppSettings = {
  apiKey: string
  model: string
  openrouterRoute: OpenRouterRoute
  language: string
  hotkey: string
  hotkeyMode: HotkeyMode
  insertMode: InsertMode
  microphoneId: string
  launchAtStartup: boolean
  showOverlay: boolean
  autoUpdate: boolean
  githubToken: string
  sttEngine: SttEngine
  routerAudioKey: string
  routerProvider: RouterProvider
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  voiceIsolation: boolean
  inputGain: number
  vadSensitivity: VadSensitivity
  overlayTheme: OverlayTheme
  appearance: 'dark' | 'light' | 'system'
  overlayPosition: OverlayPosition
  localEndpoint: string
  localModel: string
  recoveryAudio: boolean
  keepAudioForTraining: boolean
  audioRetentionDays: number
  vocabulary: VocabularyEntry[]
}

export type CaptureConfig = {
  engine: SttEngine
  microphoneId: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  voiceIsolation: boolean
  inputGain: number
  vadSensitivity: VadSensitivity
}

export type RecordingCommand = CaptureConfig & {
  action: 'start' | 'stop' | 'cancel'
  sessionId?: number
}

export type AudioLevelPayload = {
  rms: number
  bars: number[]
}

export type HistoryItem = {
  id: string
  text: string
  model: string
  createdAt: number
  durationMs: number
  source: 'live' | 'final' | 'practice'
  practiceTarget?: string
  rawText?: string
  status?: 'recording' | 'processing' | 'complete' | 'interrupted' | 'error' | 'cancelled'
  error?: string
  hasAudio?: boolean
}

export type OverlayStatus =
  'hidden' | 'listening' | 'transcribing' | 'inserting' | 'success' | 'error' | 'arm-paste'

export type OverlayState = {
  status: OverlayStatus
  partial: string
  message: string
  rms: number
  elapsedMs: number
  bars: number[]
  mode?: 'dictation' | 'practice'
}

export type ModelOption = {
  slug: string
  name: string
  route?: Exclude<OpenRouterRoute, 'auto'>
}

export const defaultSettings = (): AppSettings => ({
  apiKey: '',
  model: 'google/gemini-2.5-flash',
  openrouterRoute: 'auto',
  language: '',
  hotkey: 'Control+Shift+Space',
  hotkeyMode: 'toggle',
  insertMode: 'live',
  microphoneId: '',
  launchAtStartup: false,
  showOverlay: true,
  autoUpdate: false,
  githubToken: '',
  sttEngine: 'router-audio',
  routerAudioKey: '',
  routerProvider: 'auto',
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  inputGain: 1,
  vadSensitivity: 'medium',
  overlayTheme: defaultOverlayTheme(),
  appearance: 'dark',
  overlayPosition: 'bottom',
  localEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
  localModel: 'Systran/faster-whisper-small',
  recoveryAudio: true,
  keepAudioForTraining: false,
  audioRetentionDays: 7,
  vocabulary: []
})

export function clampInputGain(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(2.4, Math.max(0.5, Math.round(value * 20) / 20))
}

export function isRouterProvider(value: unknown): value is RouterProvider {
  return typeof value === 'string' && (ROUTER_PROVIDERS as readonly string[]).includes(value)
}

export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const merged: AppSettings = { ...defaultSettings(), ...(raw ?? {}) }
  merged.sttEngine =
    raw?.sttEngine === 'local'
      ? 'local'
      : raw?.sttEngine === 'openrouter'
        ? 'openrouter'
        : 'router-audio'
  merged.routerProvider = isRouterProvider(raw?.routerProvider) ? raw.routerProvider : 'auto'
  merged.vadSensitivity =
    raw?.vadSensitivity === 'low' ||
    raw?.vadSensitivity === 'high' ||
    raw?.vadSensitivity === 'medium'
      ? raw.vadSensitivity
      : 'medium'
  merged.inputGain = clampInputGain(merged.inputGain)
  merged.echoCancellation = raw?.echoCancellation !== false
  merged.noiseSuppression = raw?.noiseSuppression === true
  merged.autoGainControl = raw?.autoGainControl === true
  merged.voiceIsolation = raw?.voiceIsolation === true
  merged.apiKey = typeof merged.apiKey === 'string' ? merged.apiKey : ''
  merged.routerAudioKey = typeof merged.routerAudioKey === 'string' ? merged.routerAudioKey : ''
  merged.model =
    typeof merged.model === 'string' && merged.model.trim() ? merged.model : defaultSettings().model
  merged.overlayTheme = normalizeOverlayTheme(raw?.overlayTheme ?? merged.overlayTheme)
  merged.appearance =
    raw?.appearance === 'light' || raw?.appearance === 'system' ? raw.appearance : 'dark'
  merged.overlayPosition = OVERLAY_POSITIONS.includes(raw?.overlayPosition as OverlayPosition)
    ? raw!.overlayPosition!
    : 'bottom'
  merged.openrouterRoute =
    raw?.openrouterRoute === 'chat' || raw?.openrouterRoute === 'transcription'
      ? raw.openrouterRoute
      : 'auto'
  merged.localEndpoint =
    typeof merged.localEndpoint === 'string'
      ? merged.localEndpoint
      : defaultSettings().localEndpoint
  merged.localModel =
    typeof merged.localModel === 'string' ? merged.localModel : defaultSettings().localModel
  merged.recoveryAudio = raw?.recoveryAudio !== false
  merged.keepAudioForTraining = raw?.keepAudioForTraining === true
  merged.audioRetentionDays = Number.isFinite(raw?.audioRetentionDays)
    ? Math.max(1, Math.min(30, Math.round(raw!.audioRetentionDays!)))
    : 7
  merged.vocabulary = normalizeVocabulary(raw?.vocabulary)
  return merged
}

export function captureFromSettings(settings: AppSettings): CaptureConfig {
  return {
    engine: settings.sttEngine,
    microphoneId: settings.microphoneId,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
    voiceIsolation: settings.voiceIsolation,
    inputGain: settings.inputGain,
    vadSensitivity: settings.vadSensitivity
  }
}

export function recordingCommand(
  action: RecordingCommand['action'],
  settings: AppSettings
): RecordingCommand {
  return { action, ...captureFromSettings(settings) }
}

export function resolveStreamingKey(settings: AppSettings): string {
  return settings.routerAudioKey.trim()
}

export const idleUpdate = (version = '0.0.0', packaging: Packaging = 'dev'): UpdateStatus => ({
  phase: 'idle',
  currentVersion: version,
  availableVersion: '',
  percent: 0,
  message: '',
  packaging
})

export const emptyOverlay = (): OverlayState => ({
  status: 'hidden',
  partial: '',
  message: '',
  rms: 0,
  elapsedMs: 0,
  bars: []
})
