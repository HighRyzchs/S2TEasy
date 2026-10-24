/** Personal acoustic memory (beta): what the app and its settings share with the main process. */

export type VoiceMemorySettings = {
  /** Remember how I say my words on this device: HUD fixes keep a sound example. */
  enabled: boolean
  /** Suggest underlines a match on the HUD; auto replaces it when the evidence is strong. */
  mode: 'suggest' | 'auto'
  /** 0 cautious to 1 eager. */
  sensitivity: number
}

export const defaultVoiceMemory = (): VoiceMemorySettings => ({ enabled: false, mode: 'suggest', sensitivity: 0.5 })

export function normalizeVoiceMemory(raw: unknown): VoiceMemorySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<VoiceMemorySettings>
  return {
    enabled: value.enabled === true,
    mode: value.mode === 'auto' ? 'auto' : 'suggest',
    sensitivity:
      typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity)
        ? Math.round(Math.max(0, Math.min(1, value.sensitivity)) * 100) / 100
        : 0.5
  }
}

/** What happened with one detection, for the beta's test log. */
export type MatchEvent = {
  at: number
  intended: string
  heard: string
  score: number
  outcome: 'suggested' | 'applied' | 'already-right' | 'unplaced'
}

export type VoiceMemorySummary = {
  id: string
  intended: string
  heard: string[]
  examples: { id: string; heard: string; createdAt: number; ms: number }[]
  createdAt: number
  stats: { suggested: number; applied: number }
}

export type VoiceMemoryState = { memories: VoiceMemorySummary[]; recent: MatchEvent[]; encrypted: boolean }

/** A remembered phrase the HUD underlines: `text` is what was heard there, `suggestion` what you say. */
export type MemoryHint = { start: number; end: number; text: string; suggestion: string }
