import type { OutputPreferences } from '../shared/output'
import type { UsageState } from '../shared/usage'
import type { CloudStatus } from '../shared/cloud'
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
import type { VoiceMemoryState } from '../shared/voice-memory'

export type S2TApi = {
  saveOutput: (value: OutputPreferences) => Promise<AppSettings>
  copyOutput: (id: string, format: 'plain' | 'tags' | 'json') => Promise<boolean>
  learnWord: (request: LearnWordRequest) => Promise<AppSettings>
  /** The icon of a program that appears in History, as a data URL, or null. */
  appIcon: (exe: string) => Promise<string | null>
  /** Replace characters [start, end) of the open session's text. */
  hudEdit: (
    sessionId: string,
    start: number,
    end: number,
    text: string
  ) => Promise<'typed' | 'saved' | 'kept-in-history'>
  /** Take the stumbles out of everything said so far (Speech tidy). */
  hudTidy: (sessionId: string) => Promise<'typed' | 'saved' | 'kept-in-history' | 'unchanged'>
  hudPause: () => Promise<void>
  /** S2Teasy Cloud (hosted credits): account, balance, packs. */
  cloudStatus: () => Promise<CloudStatus>
  /** Opens Google sign-in in the browser and resolves once it finished there. */
  cloudSignIn: () => Promise<CloudStatus>
  cloudCancelSignIn: () => Promise<void>
  cloudSignOut: (everywhere: boolean) => Promise<void>
  /** Opens the payment page for a pack in the browser. */
  cloudBuy: (pack: string) => Promise<void>
  cloudRedeem: (code: string) => Promise<{ seconds: number; balance: number }>
  hudFinish: () => Promise<void>
  hudHold: (held: boolean) => void
  hudCues: (on: boolean) => Promise<void>
  /** The HUD needs keyboard focus to edit; false gives focus back to the app being typed into. */
  hudFocus: (focus: boolean) => Promise<void>
  /** The pointer is over a visible part of the HUD (clicks there go to the HUD, elsewhere through). */
  hudPointer: (inside: boolean) => void
  /** The parts of the HUD that are drawn, in window CSS pixels (empty while hidden). Only they take clicks. */
  hudArea: (rects: { x: number; y: number; width: number; height: number }[]) => void
  /** Show a short scripted session on the real HUD (main window only). */
  hudDemo: () => Promise<void>
  /** What the HUD did with recent clicks, as text to copy into a bug report. */
  hudDiagnostics: () => Promise<string>
  /** Beta voice memory: what it remembers and what it recently matched. */
  voiceMemory: () => Promise<VoiceMemoryState>
  forgetVoiceMemory: (kind: 'example' | 'memory' | 'all', id: string) => Promise<void>
  onVoiceMemory: (cb: (state: VoiceMemoryState) => void) => () => void

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
  appIcon: (exe) => ipcRenderer.invoke(IPC.APP_ICON, exe),
  hudEdit: (sessionId, start, end, text) =>
    ipcRenderer.invoke(IPC.HUD_EDIT, sessionId, start, end, text),
  hudTidy: (sessionId) => ipcRenderer.invoke(IPC.HUD_TIDY, sessionId),
  hudPause: () => ipcRenderer.invoke(IPC.HUD_PAUSE),
  cloudStatus: () => ipcRenderer.invoke(IPC.CLOUD_STATUS),
  cloudSignIn: () => ipcRenderer.invoke(IPC.CLOUD_SIGN_IN),
  cloudCancelSignIn: () => ipcRenderer.invoke(IPC.CLOUD_CANCEL),
  cloudSignOut: (everywhere) => ipcRenderer.invoke(IPC.CLOUD_SIGN_OUT, everywhere),
  cloudBuy: (pack) => ipcRenderer.invoke(IPC.CLOUD_BUY, pack),
  cloudRedeem: (code) => ipcRenderer.invoke(IPC.CLOUD_REDEEM, code),
  hudFinish: () => ipcRenderer.invoke(IPC.HUD_FINISH),
  hudHold: (held) => ipcRenderer.send(IPC.HUD_HOLD, held),
  hudCues: (on) => ipcRenderer.invoke(IPC.HUD_CUES, on),
  hudFocus: (focus) => ipcRenderer.invoke(IPC.HUD_FOCUS, focus),
  hudPointer: (inside) => ipcRenderer.send(IPC.HUD_POINTER, inside),
  hudArea: (rects) => ipcRenderer.send(IPC.HUD_AREA, rects),
  hudDemo: () => ipcRenderer.invoke(IPC.HUD_DEMO),
  hudDiagnostics: () => ipcRenderer.invoke(IPC.HUD_DIAGNOSTICS),
  voiceMemory: () => ipcRenderer.invoke(IPC.VOICE_MEMORY_GET),
  forgetVoiceMemory: (kind, id) => ipcRenderer.invoke(IPC.VOICE_MEMORY_FORGET, kind, id),
  onVoiceMemory: (cb) => {
    const listener = (_event: unknown, state: VoiceMemoryState) => cb(state)
    ipcRenderer.on(IPC.VOICE_MEMORY_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.VOICE_MEMORY_CHANGED, listener)
  },
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
