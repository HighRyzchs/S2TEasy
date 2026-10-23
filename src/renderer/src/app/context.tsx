import { createContext, useContext } from 'react'
import type { UsageState } from '@shared/usage'
import type { AppSettings, HistoryItem, OverlayState, UpdateStatus } from '@shared/types'
import type { Screen } from './Sidebar'

/** Where a navigation should land inside a screen (a Your voice tab, a Settings section, …). */
export type NavigateOptions = { tab?: string; section?: string; word?: string; practice?: string }

export type AppData = {
  ready: boolean
  /** Browser preview with sample data; native actions are simulated or unavailable. */
  preview: boolean
  version: string
  settings: AppSettings
  history: HistoryItem[]
  usage: UsageState
  overlay: OverlayState
  update: UpdateStatus
  /** True while a session is recording, paused or finishing. */
  active: boolean
  /** Where the current screen was asked to open (consumed by the screen). */
  target: NavigateOptions
  /** Save a settings patch; rejects (and shows a toast) on failure so editors keep their input. */
  save: (patch: Partial<AppSettings>) => Promise<void>
  /** Run an action, showing its error as a toast; resolves either way. */
  run: (action: () => Promise<unknown>) => Promise<void>
  toast: (message: string) => void
  navigate: (screen: Screen, options?: NavigateOptions) => void
  openReview: (id: string) => void
  setHistory: (history: HistoryItem[]) => void
  setUpdate: (status: UpdateStatus) => void
  replayTour: () => void
}

export const AppContext = createContext<AppData | null>(null)

export function useApp(): AppData {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside the app shell')
  return value
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not complete that action. Please try again.'
}

/** Engine name for the sidebar and Home, e.g. "Streaming · router.audio". */
export function engineLabel(settings: AppSettings): string {
  if (settings.sttEngine === 'local') return 'On this PC · local server'
  if (settings.sttEngine === 'openrouter') return `OpenRouter · ${settings.model}`
  return settings.routerProvider === 'auto'
    ? 'Streaming · router.audio'
    : `Streaming · ${settings.routerProvider}`
}

export function hasEngineKey(settings: AppSettings): boolean {
  if (settings.sttEngine === 'local') return true
  return settings.sttEngine === 'router-audio' ? !!settings.routerAudioKey : !!settings.apiKey
}
