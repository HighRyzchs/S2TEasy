import type { UsageRecord } from '@shared/usage'
import {
  defaultSettings,
  idleUpdate,
  type AppSettings,
  type HistoryItem,
  type ModelOption,
  type UpdateStatus
} from '@shared/types'

const memory = {
  settings: defaultSettings(),
  history: [
    {
      id: 'demo-1',
      text: 'Schedule a review with rosin and the design team on Thursday afternoon.',
      model: 'openai/whisper-large-v3',
      createdAt: Date.now() - 36 * 60_000,
      durationMs: 4100,
      source: 'live' as const
    },
    {
      id: 'demo-2',
      text: 'The invoice for March is already in the shared folder.',
      model: 'openai/gpt-4o-mini-transcribe',
      createdAt: Date.now() - 26 * 60 * 60_000,
      durationMs: 3200,
      source: 'final' as const
    }
  ],
  update: idleUpdate('1.0.0', 'dev')
}

memory.update = {
  ...memory.update,
  phase: 'available',
  availableVersion: '1.0.1',
  message: 'Preview — version 1.0.1 would download from GitHub Releases.'
}

function mockApi(): Window['s2t'] {
  return {
    saveOutput: async (output) => {
      const { normalizeOutputPreferences } = await import('@shared/output')
      memory.settings = { ...memory.settings, output: normalizeOutputPreferences(output) }
      return memory.settings
    },
    copyOutput: async (id, format) => {
      const { renderOutput } = await import('@shared/output')
      const item = memory.history.find((row) => row.id === id)
      if (!item) throw new Error('This take is no longer available.')
      await navigator.clipboard.writeText(renderOutput(item, memory.settings.output, format))
      return true
    },
    learnWord: async (request) => {
      const { learnFix } = await import('@shared/vocabulary')
      memory.settings = {
        ...memory.settings,
        vocabulary: learnFix(
          memory.settings.vocabulary,
          { heard: request.heard, meant: request.meant, kind: request.kind },
          () => crypto.randomUUID()
        )
      }
      return memory.settings
    },
    // Browser preview has no session to edit; the HUD showcase simulates its own.
    hudEdit: async () => 'saved',
    hudPause: async () => undefined,
    hudFinish: async () => undefined,
    hudHold: () => undefined,
    hudCues: async () => undefined,
    hudFocus: async () => undefined,
    hudPointer: () => undefined,
    getUpdateDiagnostics: async () =>
      'S2Teasy preview update report\nNo native update or installer was executed.',
    openUpdateInstaller: async () => {
      throw new Error('Preview never opens or installs executables.')
    },
    openUpdateDiagnostics: async () => {
      throw new Error('Update diagnostics are available in the desktop app.')
    },
    analyzeSpeechCues: async () => {
      throw new Error(
        'Audio cue analysis requires the desktop app. Preview does not upload audio or make paid calls.'
      )
    },
    cancelSpeechCues: async () => undefined,
    cueFeedback: async (id, analysisId, patch) => {
      const { cueFeedback } = await import('@shared/speech-cues')
      memory.history = memory.history.map((row) => {
        const item = row as HistoryItem
        return item.id === id && item.cueAnalysis?.id === analysisId
          ? { ...item, cueAnalysis: cueFeedback(item.cueAnalysis, patch) }
          : row
      }) as typeof memory.history
      return memory.history
    },
    clearSpeechCues: async () => memory.history,
    fetchCueModels: async () => [
      { slug: 'google/gemini-2.5-flash-lite', name: 'Gemini Flash-Lite · sample only' }
    ],
    reviewDictation: async () => undefined,
    onReview: () => () => undefined,
    saveWordExample: async () => {
      throw new Error('Retaining word clips requires the desktop app.')
    },
    exportUsage: async () => false,
    onUsage: () => () => undefined,
    getState: async () => ({
      settings: memory.settings,
      history: memory.history,
      version: '1.0.0',
      update: memory.update,
      usage: {
        warning: '',
        truncated: false,
        records: Array.from({ length: 52 }, (_, i): UsageRecord => ({
          id: `sample-${i}`,
          operationId: `sample-${i}`,
          sessionId: `sample-session-${i}`,
          createdAt: Date.now() - (i % 27) * 86400000,
          engine: 'openrouter',
          model: i % 3 ? 'Sample · speech model A' : 'Sample · speech model B',
          source: 'dictation',
          costUsd: i % 8 === 0 ? null : 0.007 + (i % 5) * 0.004,
          durationMs: 45000 + i * 1200,
          latencyMs: 1100,
          attempt: 1,
          outcome: 'success'
        }))
      }
    }),
    saveSettings: async (patch) => {
      memory.settings = { ...memory.settings, ...patch }
      return memory.settings
    },
    deleteHistory: async (id) => {
      memory.history = memory.history.filter((item) => item.id !== id)
      return memory.history
    },
    clearHistory: async () => {
      memory.history = []
      return []
    },
    editHistory: async (id, text) => {
      memory.history = memory.history.map((item) => (item.id === id ? { ...item, text } : item))
      return memory.history
    },
    recoverHistory: async () => {
      throw new Error('Audio recovery is available in the desktop app.')
    },
    exportAudio: async () => {
      throw new Error('Audio export is available in the desktop app.')
    },
    testKey: async (key) =>
      key.trim().startsWith('sk-or-')
        ? { ok: false, message: 'Preview only. Keys are not tested or stored securely here.' }
        : { ok: false, message: 'Preview mode — keys start with sk-or-.' },
    testRouterKey: async (key) =>
      key.trim()
        ? { ok: false, message: 'Preview only. Streaming is available in the desktop app.' }
        : { ok: false, message: 'Preview mode — paste a router.audio or provider key.' },
    fetchModels: async () =>
      [
        { slug: 'openai/whisper-large-v3', name: 'Whisper Large V3' },
        { slug: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe' }
      ] satisfies ModelOption[],
    toggleDictation: async () => undefined,
    startPractice: async () => {
      throw new Error('Voice practice requires the desktop app.')
    },
    stopRecording: async () => undefined,
    cancelRecording: async () => undefined,
    copyHistory: async () => true,
    insertHistory: async () => undefined,
    getUpdate: async () => memory.update,
    checkUpdate: async () => {
      memory.update = {
        ...memory.update,
        phase: 'ready',
        availableVersion: '1.0.1',
        percent: 100,
        message: 'Preview — restart would replace the EXE in place.'
      }
      return memory.update
    },
    installUpdate: async () => memory.update,
    sendLevel: () => undefined,
    sendPcm: () => undefined,
    sendUtterance: () => undefined,
    sendFinished: () => undefined,
    sendRecordingError: () => undefined,
    onOverlay: () => () => undefined,
    onCommand: () => () => undefined,
    onSettings: () => () => undefined,
    onHistory: () => () => undefined,
    onUpdate: () => () => undefined
  }
}

export function ensureApi(): void {
  if (!window.s2t) {
    if (import.meta.env.VITE_BROWSER_PREVIEW !== '1') {
      const root = document.getElementById('root')
      if (root)
        root.textContent =
          'The desktop bridge did not load. Restart S2Teasy; your local data has not been deleted.'
      throw new Error('Desktop IPC unavailable; refusing to substitute preview data.')
    }
    window.s2t = mockApi()
  }
}

export type { AppSettings, HistoryItem, UpdateStatus }
