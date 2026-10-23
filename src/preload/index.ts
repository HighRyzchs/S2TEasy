import type { OutputPreferences } from '../shared/output'
import type { UsageState } from '../shared/usage'
import type { CueRequest, CueFeedback } from '../shared/speech-cues'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  AppState,
  LearnWordRequest,
  AudioLevelPayload,
  HistoryItem,
  OverlayState,
  RecordingCommand,
  RouterProvider,
  UpdateStatus
} from '../shared/types'
import type { ModelOption } from '../shared/types'

export type S2TApi = {
  saveOutput: (value: OutputPreferences) => Promise<AppSettings>
  copyOutput: (id: string, format: 'plain' | 'tags' | 'json') => Promise<boolean>
  learnWord: (request: LearnWordRequest) => Promise<AppSettings>

  getUpdateDiagnostics: () => Promise<string>
  openUpdateInstaller: () => Promise<UpdateStatus>
  openUpdateDiagnostics: () => Promise<void>
  analyzeSpeechCues: (id: string, range: CueRequest) => Promise<HistoryItem[]>
  cancelSpeechCues: (id: string) => Promise<void>
  cueFeedback: (id: string, analysisId: string, patch: CueFeedback) => Promise<HistoryItem[]>
  clearSpeechCues: (id: string) => Promise<HistoryItem[]>
  fetchCueModels: () => Promise<ModelOption[]>
  reviewDictation: () => Promise<void>
  onReview: (cb: (id: string) => void) => () => void
  saveWordExample: (id: string, index: number, intended: string) => Promise<HistoryItem[]>
  getState: () => Promise<AppState>
  exportUsage: () => Promise<boolean>
  onUsage: (cb: (usage: UsageState) => void) => () => void
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  deleteHistory: (id: string) => Promise<HistoryItem[]>
  clearHistory: () => Promise<HistoryItem[]>
  editHistory: (id: string, text: string) => Promise<HistoryItem[]>
  recoverHistory: (id: string) => Promise<HistoryItem[]>
  exportAudio: (id: string) => Promise<boolean>
  testKey: (key: string) => Promise<{ ok: boolean; message: string }>
  testRouterKey: (
    key: string,
    provider?: RouterProvider
  ) => Promise<{ ok: boolean; message: string }>
  fetchModels: (key: string) => Promise<ModelOption[]>
  toggleDictation: () => Promise<void>
  startPractice: (intendedText: string) => Promise<void>
  stopRecording: () => Promise<void>
  cancelRecording: () => Promise<void>
  copyHistory: (text: string) => Promise<boolean>
  insertHistory: (text: string) => Promise<void>
  getUpdate: () => Promise<UpdateStatus>
  checkUpdate: (download?: boolean) => Promise<UpdateStatus>
  installUpdate: () => Promise<UpdateStatus>
  sendLevel: (payload: AudioLevelPayload, sessionId?: number) => void
  sendPcm: (bytes: Uint8Array, sessionId?: number) => void
  sendUtterance: (
    wavBase64: string,
    durationMs: number,
    sessionId?: number,
    startMs?: number
  ) => void
  sendFinished: (payload: {
    leftoverBase64: string
    fullBase64: string
    durationMs: number
    sessionId?: number
    leftoverStartMs?: number
  }) => void
  sendRecordingError: (message: string, sessionId?: number) => void
  onOverlay: (cb: (state: OverlayState) => void) => () => void
  onCommand: (cb: (payload: RecordingCommand) => void) => () => void
  onSettings: (cb: (settings: AppSettings) => void) => () => void
  onHistory: (cb: (history: HistoryItem[]) => void) => () => void
  onUpdate: (cb: (status: UpdateStatus) => void) => () => void
}

const api: S2TApi = {
  saveOutput: (value) => ipcRenderer.invoke(IPC.SAVE_OUTPUT, value),
  copyOutput: (id, format) => ipcRenderer.invoke(IPC.COPY_OUTPUT, id, format),
  learnWord: (request) => ipcRenderer.invoke(IPC.LEARN_WORD, request),
  getUpdateDiagnostics: () => ipcRenderer.invoke(IPC.GET_UPDATE_DIAGNOSTICS),
  openUpdateInstaller: () => ipcRenderer.invoke(IPC.OPEN_UPDATE_INSTALLER),
  openUpdateDiagnostics: () => ipcRenderer.invoke(IPC.OPEN_UPDATE_DIAGNOSTICS),
  analyzeSpeechCues: (id, range) => ipcRenderer.invoke(IPC.ANALYZE_CUES, id, range),
  cancelSpeechCues: (id) => ipcRenderer.invoke(IPC.CANCEL_CUES, id),
  cueFeedback: (id, analysisId, patch) =>
    ipcRenderer.invoke(IPC.CUE_FEEDBACK, id, analysisId, patch),
  clearSpeechCues: (id) => ipcRenderer.invoke(IPC.CLEAR_CUES, id),
  fetchCueModels: () => ipcRenderer.invoke(IPC.CUE_MODELS),
  reviewDictation: () => ipcRenderer.invoke(IPC.REVIEW_DICTATION),
  saveWordExample: (id, index, intended) =>
    ipcRenderer.invoke(IPC.WORD_EXAMPLE, id, index, intended),
  onReview: (cb) => {
    const listener = (_event: unknown, id: string) => cb(id)
    ipcRenderer.on(IPC.OPEN_REVIEW, listener)
    return () => ipcRenderer.removeListener(IPC.OPEN_REVIEW, listener)
  },
  exportUsage: () => ipcRenderer.invoke(IPC.EXPORT_USAGE),
  onUsage: (cb) => {
    const listener = (_event: unknown, usage: UsageState) => cb(usage)
    ipcRenderer.on(IPC.USAGE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.USAGE_CHANGED, listener)
  },
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, patch),
  deleteHistory: (id) => ipcRenderer.invoke(IPC.DELETE_HISTORY, id),
  clearHistory: () => ipcRenderer.invoke(IPC.CLEAR_HISTORY),
  editHistory: (id, text) => ipcRenderer.invoke(IPC.EDIT_HISTORY, id, text),
  recoverHistory: (id) => ipcRenderer.invoke(IPC.RECOVER_HISTORY, id),
  exportAudio: (id) => ipcRenderer.invoke(IPC.EXPORT_AUDIO, id),
  testKey: (key) => ipcRenderer.invoke(IPC.TEST_KEY, key),
  testRouterKey: (key, provider) => ipcRenderer.invoke(IPC.TEST_ROUTER_KEY, key, provider),
  fetchModels: (key) => ipcRenderer.invoke(IPC.FETCH_MODELS, key),
  toggleDictation: () => ipcRenderer.invoke(IPC.TOGGLE_DICTATION),
  startPractice: (intendedText) => ipcRenderer.invoke(IPC.START_PRACTICE, intendedText),
  stopRecording: () => ipcRenderer.invoke(IPC.STOP_RECORDING),
  cancelRecording: () => ipcRenderer.invoke(IPC.CANCEL_RECORDING),
  copyHistory: (text) => ipcRenderer.invoke(IPC.COPY_HISTORY, text),
  insertHistory: (text) => ipcRenderer.invoke(IPC.INSERT_HISTORY, text),
  getUpdate: () => ipcRenderer.invoke(IPC.GET_UPDATE),
  checkUpdate: (download) => ipcRenderer.invoke(IPC.CHECK_UPDATE, download),
  installUpdate: () => ipcRenderer.invoke(IPC.INSTALL_UPDATE),
  sendLevel: (payload, sessionId) => ipcRenderer.send(IPC.AUDIO_LEVEL, { payload, sessionId }),
  sendPcm: (bytes, sessionId) => {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    ipcRenderer.send(IPC.AUDIO_PCM, { bytes: copy, sessionId })
  },
  sendUtterance: (wavBase64, durationMs, sessionId, startMs) =>
    ipcRenderer.send(IPC.AUDIO_UTTERANCE, { wavBase64, durationMs, sessionId, startMs }),
  sendFinished: (payload) => ipcRenderer.send(IPC.RECORDING_FINISHED, payload),
  sendRecordingError: (message, sessionId) =>
    ipcRenderer.send(IPC.RECORDING_ERROR, { message, sessionId }),
  onOverlay: (cb) => {
    const listener = (_event: unknown, state: OverlayState) => cb(state)
    ipcRenderer.on(IPC.OVERLAY_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.OVERLAY_CHANGED, listener)
  },
  onCommand: (cb) => {
    const listener = (_event: unknown, payload: RecordingCommand) => cb(payload)
    ipcRenderer.on(IPC.COMMAND_RECORDING, listener)
    return () => ipcRenderer.removeListener(IPC.COMMAND_RECORDING, listener)
  },
  onSettings: (cb) => {
    const listener = (_event: unknown, settings: AppSettings) => cb(settings)
    ipcRenderer.on(IPC.SETTINGS_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, listener)
  },
  onHistory: (cb) => {
    const listener = (_event: unknown, history: HistoryItem[]) => cb(history)
    ipcRenderer.on(IPC.HISTORY_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.HISTORY_CHANGED, listener)
  },
  onUpdate: (cb) => {
    const listener = (_event: unknown, status: UpdateStatus) => cb(status)
    ipcRenderer.on(IPC.UPDATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.UPDATE_CHANGED, listener)
  }
}

contextBridge.exposeInMainWorld('s2t', api)
