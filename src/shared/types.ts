import { defaultVoiceMemory, normalizeVoiceMemory, type MemoryHint, type VoiceMemorySettings } from './voice-memory'
import { defaultTidySettings, normalizeTidy, type TidySettings } from './tidy'
import { normalizeOutputPreferences, type OutputPreferences } from './output'
import type { WordTiming } from './word-timing'
import type { UsageState } from './usage'
import { defaultOverlayTheme, normalizeOverlayTheme, type OverlayTheme } from './overlay-theme'
import { defaultHudSettings, normalizeHudSettings, type HudSettings } from './hud'
import type { AppInfo } from './apps'
import {
  normalizeVocabulary,
  type VocabularyEntry,
  type VocabularyHit,
  type WordKind
} from './vocabulary'
import { normalizeSpeechCues, type SpeechCueSettings, type CueAnalysis } from './speech-cues'

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
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'applying' | 'current' | 'error'

export type UpdateStatus = {
  canOpenInstaller?: boolean
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
  usage?: UsageState
  overlay?: OverlayState
}

export type AppSettings = {
  output: OutputPreferences
  speechCues: SpeechCueSettings
  displayName: string
  welcomeCompleted: boolean
  setupChecklistDismissed: boolean
  apiKey: string
  model: string
  requestWordTimings: boolean
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
  captureTailMs: number
  overlayTheme: OverlayTheme
  appearance: 'dark' | 'light' | 'system'
  overlayOffsetX: number
  overlayOffsetY: number
  overlayPosition: OverlayPosition
  localEndpoint: string
  localModel: string
  recoveryAudio: boolean
  keepAudioForTraining: boolean
  audioRetentionDays: number
  vocabulary: VocabularyEntry[]
  /** Experimental: pass personal words to the streaming provider as Deepgram key terms. */
  streamKeyterms: boolean
  /** Experimental: ask Deepgram streaming to listen for the languages set in Speech tidy too. */
  streamMixedLanguages: boolean
  /** After a pause, the session finishes by itself this long after the last HUD interaction. */
  finishAfterMs: number
  /** Monthly spend limit for paid extras in US dollars; 0 means no limit. Speech is never stopped. */
  monthlyLimitUsd: number
  /** Speech cues on or off per program (keyed by `appKey`), overriding the global switch. */
  appCues: Record<string, boolean>
  /** Opt-in: after a session, a small text model checks that accent swaps fit their sentence. */
  accentContextCheck: boolean
  /** Beta: personal acoustic memory, learned from HUD fixes. */
  voiceMemory: VoiceMemorySettings
  /** Take stutters, fillers, restarts and pause breaks out of dictated text. */
  tidy: TidySettings
  hud: HudSettings
  /** Your voice suggestions the user chose not to see again (heard→meant keys). */
  dismissedSuggestions: string[]
}

/** A fix the user asked S2Teasy to remember, from the HUD, History or practice. */
export type LearnWordRequest = {
  heard: string
  meant: string
  kind: WordKind
  /** Keep the moment the word was said, when the session has audio and word timings. */
  clip?: { sessionId: string; startMs: number; endMs: number }
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
  captureTailMs: number
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
  cueAnalysis?: CueAnalysis
  cueError?: string
  id: string
  text: string
  model: string
  createdAt: number
  durationMs: number
  source: 'live' | 'final' | 'practice'
  practiceTarget?: string
  words?: WordTiming[]
  unconfirmedText?: string
  rawText?: string
  status?: 'recording' | 'processing' | 'complete' | 'interrupted' | 'error' | 'cancelled'
  error?: string
  hasAudio?: boolean
  /** Words changed by personal words before they were typed. */
  fixes?: VocabularyHit[]
  /** Corrections the user made in the HUD during the session. */
  edits?: { from: string; to: string }[]
  /** The program the session typed into (name and executable path, never the window title). */
  app?: AppInfo
}

export type OverlayStatus =
  | 'hidden'
  | 'listening'
  | 'paused'
  | 'transcribing'
  | 'inserting'
  | 'success'
  | 'error'
  | 'arm-paste'
  | 'leaving'

export type OverlayState = {
  cueAnalysis?: CueAnalysis
  cueError?: string
  status: OverlayStatus
  partial: string
  message: string
  rms: number
  elapsedMs: number
  bars: number[]
  mode?: 'dictation' | 'practice'
  sessionId?: string
  /** Live typing: the first `typedLength` characters of `partial` are already in the target app. */
  typedLength?: number
  /** Speech cues are on for this session (the HUD switch). */
  cues?: boolean
  /** Paused: when the session finishes by itself (epoch ms). Absent while the HUD holds it. */
  finishAt?: number
  /** A short message for the HUD, such as where an edit was saved. */
  notice?: string
  noticeAt?: number
  /** Speech cues heard so far, each shown before the word it starts at (word index in `partial`). */
  liveCues?: { word: number; label: string }[]
  /** Beta voice memory: places that sound like something you taught it, for the HUD to underline. */
  memoryHints?: MemoryHint[]
}

export type ModelOption = {
  slug: string
  name: string
  route?: Exclude<OpenRouterRoute, 'auto'>
}

export const defaultSettings = (): AppSettings => ({
  output: normalizeOutputPreferences(),
  speechCues: normalizeSpeechCues(),
  displayName: '',
  welcomeCompleted: false,
  setupChecklistDismissed: false,
  apiKey: '',
  model: 'google/gemini-2.5-flash',
  requestWordTimings: false,
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
  captureTailMs: 600,
  overlayTheme: defaultOverlayTheme(),
  appearance: 'dark',
  overlayOffsetX: 0,
  overlayOffsetY: 0,
  overlayPosition: 'bottom',
  localEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
  localModel: 'Systran/faster-whisper-small',
  recoveryAudio: true,
  keepAudioForTraining: false,
  audioRetentionDays: 7,
  vocabulary: [],
  streamKeyterms: false,
  streamMixedLanguages: false,
  finishAfterMs: 7000,
  monthlyLimitUsd: 0,
  appCues: {},
  accentContextCheck: false,
  voiceMemory: defaultVoiceMemory(),
  tidy: defaultTidySettings(),
  hud: defaultHudSettings(),
  dismissedSuggestions: []
})

export function clampInputGain(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(2.4, Math.max(0.5, Math.round(value * 20) / 20))
}

export function isRouterProvider(value: unknown): value is RouterProvider {
  return typeof value === 'string' && (ROUTER_PROVIDERS as readonly string[]).includes(value)
}

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return Array.from(
    value
      .normalize('NFC')
      .replace(/\s+/gu, ' ')
      .replace(/[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu, '')
      .trim()
  )
    .slice(0, 60)
    .join('')
}

export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const merged: AppSettings = { ...defaultSettings(), ...(raw ?? {}) }
  merged.displayName = normalizeDisplayName(raw?.displayName)
  merged.output = normalizeOutputPreferences(raw?.output)
  merged.speechCues = normalizeSpeechCues(raw?.speechCues)
  merged.welcomeCompleted = raw?.welcomeCompleted === true
  merged.setupChecklistDismissed = raw?.setupChecklistDismissed === true
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
  merged.requestWordTimings = raw?.requestWordTimings === true
  merged.captureTailMs = Number.isFinite(raw?.captureTailMs)
    ? Math.max(0, Math.min(1500, Math.round(raw!.captureTailMs! / 100) * 100))
    : 600
  merged.inputGain = clampInputGain(merged.inputGain)
  merged.echoCancellation = raw?.echoCancellation !== false
  merged.noiseSuppression = raw?.noiseSuppression === true
  merged.autoGainControl = raw?.autoGainControl === true
  merged.voiceIsolation = raw?.voiceIsolation === true
  merged.apiKey = typeof merged.apiKey === 'string' ? merged.apiKey : ''
  merged.routerAudioKey = typeof merged.routerAudioKey === 'string' ? merged.routerAudioKey : ''
  merged.model =
    typeof merged.model === 'string' && merged.model.trim() ? merged.model : defaultSettings().model
  merged.overlayOffsetX = Math.round(
    Math.max(-4000, Math.min(4000, Number(raw?.overlayOffsetX) || 0))
  )
  merged.overlayOffsetY = Math.round(
    Math.max(-4000, Math.min(4000, Number(raw?.overlayOffsetY) || 0))
  )
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
  merged.streamKeyterms = raw?.streamKeyterms === true
  merged.streamMixedLanguages = raw?.streamMixedLanguages === true
  merged.finishAfterMs = Number.isFinite(raw?.finishAfterMs)
    ? Math.min(30_000, Math.max(2000, Math.round(raw!.finishAfterMs! / 500) * 500))
    : 7000
  merged.monthlyLimitUsd =
    Number.isFinite(raw?.monthlyLimitUsd) && raw!.monthlyLimitUsd! > 0
      ? Math.min(10_000, Math.round(raw!.monthlyLimitUsd! * 100) / 100)
      : 0
  merged.appCues = Object.fromEntries(
    Object.entries(raw?.appCues && typeof raw.appCues === 'object' ? raw.appCues : {})
      .filter(([key, on]) => /^[\w .+-]{1,60}$/.test(key) && typeof on === 'boolean')
      .slice(0, 200)
  )
  merged.accentContextCheck = raw?.accentContextCheck === true
  merged.voiceMemory = normalizeVoiceMemory(raw?.voiceMemory)
  merged.tidy = normalizeTidy(raw?.tidy)
  merged.hud = normalizeHudSettings(raw?.hud, raw?.overlayTheme)
  merged.dismissedSuggestions = Array.isArray(raw?.dismissedSuggestions)
    ? raw.dismissedSuggestions.filter((key): key is string => typeof key === 'string').slice(-500)
    : []
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
    captureTailMs: settings.captureTailMs,
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
