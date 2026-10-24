import { sampleHistory, sampleUsage, sampleVocabulary, sampleVoiceMemory } from './sample-data'
import {
  defaultSettings,
  idleUpdate,
  type AppSettings,
  type HistoryItem,
  type ModelOption,
  type UpdateStatus
} from '@shared/types'

const memory = {
  // A configured, lived-in workspace so every screen can be previewed and screenshotted.
  settings: {
    ...defaultSettings(),
    welcomeCompleted: true,
    routerAudioKey: 'preview-sample-key',
    routerProvider: 'deepgram',
    vocabulary: sampleVocabulary
  } as AppSettings,
  history: sampleHistory(),
  update: idleUpdate('1.9.0', 'dev')
}

memory.update = {
  ...memory.update,
  phase: 'current',
  message: 'Up to date. Preview only; updates come from GitHub Releases in the desktop app.'
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
    appIcon: async () => null,
    // Browser preview has no session to edit; the HUD showcase simulates its own.
    hudEdit: async () => 'saved',
    hudPause: async () => undefined,
    hudFinish: async () => undefined,
    hudHold: () => undefined,
    hudCues: async () => undefined,
    hudFocus: async () => undefined,
    hudPointer: () => undefined,
    hudArea: () => undefined,
    voiceMemory: async () => sampleVoiceMemory(),
    forgetVoiceMemory: async () => undefined,
    onVoiceMemory: () => () => undefined,
    hudDiagnostics: async () => 'Preview: no HUD diagnostics.',
    hudDemo: async () => {
      throw new Error('The desktop app shows the HUD on your screen. This preview shows it above.')
    },
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
      version: '1.10.0-beta.6',
      update: memory.update,
      usage: {
        warning: '',
        truncated: false,
        records: sampleUsage()
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
        availableVersion: '1.9.1',
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
