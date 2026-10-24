import { analyzeAutomaticCues } from './automatic-cues'
import { normalizeOutputPreferences, renderOutput, type OutputPreferences } from '../shared/output'
import { bringToFront, copyTranscript } from './inject'
import { e2eEnabled, fakeInjector, FakeStream } from './e2e'
import { UsageStore } from './usage-store'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, protocol } from 'electron'
import { VoiceMemoryService } from './voice-memory/service'
import { VoiceMemoryStore } from './voice-memory/store'
import type { VoiceMemoryState } from '../shared/voice-memory'
import { randomUUID } from 'node:crypto'
import type { WordTiming } from '../shared/word-timing'
import { audioResponse } from './audio-response'
import { wordExample } from './word-example'
import { SpeechCueService } from './speech-cue-service'
import { analyzeCueAudio, fetchCueModels } from './speech-cue-model'
import { observeAudio } from './audio-observations'
import { checkAccentSwaps } from './accent-check-model'
import type { CueRequest, CueFeedback } from '../shared/speech-cues'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { SessionJournal, pcmToWav } from './session-journal'
import {
  applyVocabulary,
  engineHintTerms,
  learnFix,
  recordHits,
  WORD_KINDS,
  type WordKind
} from '../shared/vocabulary'
import { joinUtterances } from '../shared/transcript'
import { emptyOverlay, normalizeSettings } from '../shared/types'
import { extrasPaused, LIMIT_REACHED, usageCsv } from '../shared/usage'
import { transcribeAudio } from './openrouter'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  AudioLevelPayload,
  HistoryItem,
  LearnWordRequest,
  OverlayState,
  RouterProvider,
  UpdateStatus
} from '../shared/types'
import { DictationController, LEAVE_MS } from './dictation'
import { demoFrames } from './hud-demo'
import { HotkeyManager } from './hotkeys'
import { fetchTranscriptionModels, testApiKey } from './openrouter'
import { testRouterAudioKey, type RouterAudioClient } from './router-audio'
import { Store } from './store'
import { createTray } from './tray'
import { UpdateLauncher } from './updater'
import {
  createMainWindow,
  createOverlayWindow,
  createRecorderWindow,
  placeOverlay,
  sizeOverlay
} from './windows'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 's2t-audio',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let quitting = false
// Last key press or click outside the HUD, for deciding whether typed text can be fixed in place.
let lastExternalInputAt = 0
let store: Store
let dictation: DictationController
let updater: UpdateLauncher
let usage: UsageStore
let journal: SessionJournal
let speechCues: SpeechCueService
let recoveryBusy = false
let overlayState = emptyOverlay()
let hudArea: { x: number; y: number; width: number; height: number } | null = null
// A short log of what the HUD window did with the mouse and its buttons, for diagnosing clicks.
const hudLog: string[] = []
function logHud(line: string): void {
  hudLog.push(`${new Date().toISOString().slice(11, 23)} ${line}`)
  if (hudLog.length > 400) hudLog.splice(0, hudLog.length - 400)
}

let hudEditing = false
let hudTakesClicks: boolean | null = null
let hudClickTicks = 0

/**
 * Let clicks reach the HUD while the mouse is over the part that is drawn, or while it is being
 * edited. Windows can reset a window's click-through state (focus changes do), so the wanted state
 * is applied again every half second instead of trusting what was last set.
 */
function syncHudClicks(): void {
  const window = overlayWindow
  if (!window || window.isDestroyed()) return
  // A session can end mid-edit; a hidden HUD never holds on to clicks.
  if (!window.isVisible()) hudEditing = false
  let inside = hudEditing
  if (!inside && hudArea && window.isVisible()) {
    const bounds = window.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const x = cursor.x - bounds.x
    const y = cursor.y - bounds.y
    inside = x >= hudArea.x && x < hudArea.x + hudArea.width && y >= hudArea.y && y < hudArea.y + hudArea.height
  }
  // Re-applying while the mouse is over the HUD could drop a click in progress, so the periodic
  // refresh only runs while clicks should pass through.
  hudClickTicks = (hudClickTicks + 1) % 15
  if (inside === hudTakesClicks && (inside || hudClickTicks !== 0)) return
  if (inside !== hudTakesClicks) {
    const bounds = window.getBounds()
    const cursor = screen.getCursorScreenPoint()
    logHud(
      `${inside ? 'take clicks' : 'pass clicks'} cursor=${cursor.x},${cursor.y} window=${bounds.x},${bounds.y},${bounds.width}x${bounds.height} area=${JSON.stringify(hudArea)} editing=${hudEditing}`
    )
  }
  hudTakesClicks = inside
  window.setIgnoreMouseEvents(!inside, { forward: true })
}
let voiceMemory: VoiceMemoryService
let voiceMemoryEncrypted = false
const voiceMemoryState = (): VoiceMemoryState => ({ ...voiceMemory.list(), encrypted: voiceMemoryEncrypted })
let trayUi: ReturnType<typeof createTray> | null = null
const hotkeys = new HotkeyManager()

function sendMain(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function sendBoth(channel: string, payload: unknown): void {
  sendMain(channel, payload)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload)
  }
}

function applyStartup(settings: AppSettings): void {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, path: app.getPath('exe') })
}

function broadcastSettings(): void {
  sendBoth(IPC.SETTINGS_CHANGED, store.getSettings())
}

function broadcastHistory(): void {
  sendMain(IPC.HISTORY_CHANGED, store.getHistory())
}

function overlayChanged(state: OverlayState): void {
  overlayState = state
  sendBoth(IPC.OVERLAY_CHANGED, state)
}

// "Show it on my screen": a scripted HUD session on the real overlay. A real session ends it.
let demoTimers: NodeJS.Timeout[] = []

function stopHudDemo(hide: boolean): void {
  if (!demoTimers.length) return
  for (const timer of demoTimers) clearTimeout(timer)
  demoTimers = []
  if (!hide) return
  overlayChanged(emptyOverlay())
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
}

function showHudDemo(): void {
  if (dictation.isBusy()) throw new Error('Finish dictating first, then try the HUD on your screen.')
  if (!overlayWindow || overlayWindow.isDestroyed()) throw new Error('The HUD window is not available.')
  stopHudDemo(false)
  const settings = store.getSettings()
  sizeOverlay(overlayWindow, settings.hud)
  placeOverlay(overlayWindow, settings.hud, settings.overlayPosition, {
    x: settings.overlayOffsetX,
    y: settings.overlayOffsetY
  })
  const frames = demoFrames(Date.now(), settings.hud.showCues)
  overlayChanged(frames[0].state)
  overlayWindow.showInactive()
  for (const frame of frames.slice(1)) demoTimers.push(setTimeout(() => overlayChanged(frame.state), frame.at))
  const last = frames[frames.length - 1].at
  demoTimers.push(setTimeout(() => stopHudDemo(true), last + LEAVE_MS))
}

function broadcastUpdate(status: UpdateStatus): void {
  sendMain(IPC.UPDATE_CHANGED, status)
  trayUi?.refresh(status)
}

async function setup(): Promise<void> {
  store = new Store()
  usage = new UsageStore(join(app.getPath('userData'), 'usage.json'))
  journal = new SessionJournal(join(app.getPath('userData'), 'sessions'))
  speechCues = new SpeechCueService({
    settings: () => store.getSettings(),
    history: () => store.getHistory(),
    read: (id, range) => journal.readPcmExcerpt(id, range),
    save: (item) => {
      journal.save(item)
      store.addHistory(item)
      broadcastHistory()
    },
    busy: () => dictation?.isBusy() || recoveryBusy,
    usage: (sessionId, row) =>
      sendMain(IPC.USAGE_CHANGED, usage.record({ ...row, sessionId, source: 'speech-cues' }))
  })
  for (const item of journal.list(store.getSettings().audioRetentionDays)) store.addHistory(item)
  // Expire retained audio even when the app is left running for days.
  const retentionTimer = setInterval(() => {
    if (dictation?.isBusy() || recoveryBusy || speechCues.isBusy()) return
    for (const item of journal.list(store.getSettings().audioRetentionDays)) store.addHistory(item)
    broadcastHistory()
  }, 60 * 60_000)
  retentionTimer.unref()
  applyStartup(store.getSettings())
  updater = new UpdateLauncher(
    () => store.getSettings().githubToken,
    (status) => broadcastUpdate(status)
  )

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'mediaKeySystem')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'mediaKeySystem'
  })

  mainWindow = createMainWindow()
  overlayWindow = createOverlayWindow()
  sizeOverlay(overlayWindow, store.getSettings().hud)
  recorderWindow = createRecorderWindow()

  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  // Beta personal acoustic memory: sound examples from HUD fixes, encrypted when Windows allows.
  const voiceCipher = safeStorage.isEncryptionAvailable()
    ? { encrypt: (text: string) => safeStorage.encryptString(text), decrypt: (data: Buffer) => safeStorage.decryptString(data) }
    : undefined
  voiceMemoryEncrypted = !!voiceCipher
  voiceMemory = new VoiceMemoryService(
    new VoiceMemoryStore(join(app.getPath('userData'), 'voice-memory.bin'), voiceCipher),
    () => sendMain(IPC.VOICE_MEMORY_CHANGED, voiceMemoryState())
  )

  dictation = new DictationController({
    overlay: overlayWindow,
    journal,
    isRecovering: () => recoveryBusy,
    onUsage: (row) => sendMain(IPC.USAGE_CHANGED, usage.record(row)),
    // S2Teasy's own keystrokes reach the hook a moment after it types; a short margin skips them.
    targetUntouchedSince: (since) => lastExternalInputAt <= since + 250,
    onVocabularyHits: (hits) => {
      store.saveSettings({ vocabulary: recordHits(store.getSettings().vocabulary, hits) })
      broadcastSettings()
    },
    onReview: (id) => {
      mainWindow?.show()
      mainWindow?.focus()
      sendMain(IPC.OPEN_REVIEW, id)
    },
    checkAccents: async (item, text, slots, settings, signal) => {
      if (extrasPaused(usage.snapshot().records, settings.monthlyLimitUsd))
        throw new Error(LIMIT_REACHED)
      if (!settings.apiKey.trim()) throw new Error('Save an OpenRouter key to use the context check.')
      return checkAccentSwaps({
        apiKey: settings.apiKey,
        text,
        slots,
        signal,
        onUsage: (row) =>
          sendMain(IPC.USAGE_CHANGED, usage.record({ ...row, sessionId: item.id, source: 'context-check' }))
      })
    },
    analyzeCueWindow: async (item, settings, range, signal) => {
      if (extrasPaused(usage.snapshot().records, settings.monthlyLimitUsd))
        throw new Error(LIMIT_REACHED)
      if (!settings.apiKey.trim())
        throw new Error('Save an OpenRouter key in Voice intelligence to hear speech cues.')
      const excerpt = journal.readPcmExcerpt(item.id, range)
      const observed = observeAudio(excerpt)
      if (observed.durationMs < 500 || observed.rms < 0.002) return undefined
      const result = await analyzeCueAudio({
        apiKey: settings.apiKey,
        settings: settings.speechCues,
        wavBase64: pcmToWav(excerpt).toString('base64'),
        durationMs: observed.durationMs,
        startMs: range.startMs,
        signal,
        onUsage: (row) =>
          sendMain(IPC.USAGE_CHANGED, usage.record({ ...row, sessionId: item.id, source: 'speech-cues' }))
      })
      const shift = (at: { startMs: number; endMs: number }) => ({
        startMs: at.startMs + range.startMs,
        endMs: at.endMs + range.startMs
      })
      return { ...result, observations: { ...observed, quietIntervals: observed.quietIntervals.map(shift) } }
    },
    analyzeCompleted: async (item, settings, signal) => {
      if (extrasPaused(usage.snapshot().records, settings.monthlyLimitUsd))
        throw new Error(LIMIT_REACHED)
      return analyzeAutomaticCues(journal.readPcm(item.id), settings, signal, (row) =>
        sendMain(
          IPC.USAGE_CHANGED,
          usage.record({ ...row, sessionId: item.id, source: 'speech-cues' })
        )
      )
    },
    getSettings: () =>
      e2eEnabled
        ? { ...store.getSettings(), sttEngine: 'router-audio', routerAudioKey: 'e2e', welcomeCompleted: true }
        : store.getSettings(),
    onOverlay: (state) => {
      stopHudDemo(false)
      overlayChanged(state)
    },
    onHistoryItem: (item: HistoryItem) => {
      const previous = store.getHistory()
      store.addHistory(item)
      const retained = new Set(store.getHistory().map((row) => row.id))
      for (const row of previous) if (!retained.has(row.id)) journal.delete(row.id)
      broadcastHistory()
    },
    sendOverlayCommand: (payload) => {
      const recorder = recorderWindow
      if (!recorder || recorder.isDestroyed()) return
      const send = () => {
        if (!recorder.isDestroyed() && payload.sessionId === dictation.currentGeneration())
          recorder.webContents.send(IPC.COMMAND_RECORDING, payload)
      }
      if (recorder.webContents.isLoadingMainFrame())
        recorder.webContents.once('did-finish-load', send)
      else send()
    },
    placeOverlay: () => {
      if (overlayWindow && !overlayWindow.isDestroyed())
        placeOverlay(overlayWindow, store.getSettings().hud, store.getSettings().overlayPosition, {
          x: store.getSettings().overlayOffsetX,
          y: store.getSettings().overlayOffsetY
        })
    }
  }, {
    voiceMemory,
    ...(e2eEnabled
      ? { createStream: () => new FakeStream() as unknown as RouterAudioClient, injector: fakeInjector }
      : {})
  })
  if (e2eEnabled)
    Object.assign(globalThis, {
      __s2t: {
        dictation,
        overlay: () => overlayWindow,
        state: () => overlayState,
        hudArea: () => hudArea,
        hudLog: () => hudLog.join('\n'),
        typed: () => fakeInjector.typed,
        history: () => store.getHistory(),
        settings: (patch: Partial<AppSettings>) => {
          store.saveSettings(patch)
          broadcastSettings()
          if (overlayWindow) sizeOverlay(overlayWindow, store.getSettings().hud)
        }
      }
    })

  recorderWindow.webContents.on('render-process-gone', () => {
    if (dictation.isBusy())
      dictation.recordingError(
        'Microphone capture stopped unexpectedly. Saved text and recovery audio are available in History.',
        dictation.currentGeneration()
      )
  })

  trayUi = createTray({
    mainWindow,
    onToggle: () => dictation.toggle(),
    onQuit: () => {
      quitting = true
    },
    onCheckUpdate: () => {
      void updater.check({ force: true, download: store.getSettings().autoUpdate })
    },
    onInstallUpdate: () => updater.install()
  })

  hotkeys.start({
    onStart: () => dictation.holdStart(),
    onStop: () => dictation.holdEnd(),
    onToggle: () => dictation.toggle(),
    onInput: (input) => {
      // Typing in the HUD or clicking on it is not touching the app S2Teasy types into.
      if (!overlayWindow || overlayWindow.isDestroyed() || overlayWindow.isFocused()) return
      if (input.kind === 'mouse') {
        const point =
          process.platform === 'win32'
            ? screen.screenToDipPoint({ x: input.x, y: input.y })
            : { x: input.x, y: input.y }
        const bounds = overlayWindow.getBounds()
        if (
          overlayWindow.isVisible() &&
          point.x >= bounds.x &&
          point.x < bounds.x + bounds.width &&
          point.y >= bounds.y &&
          point.y < bounds.y + bounds.height
        )
          return
      }
      lastExternalInputAt = Date.now()
    }
  })
  const initial = store.getSettings()
  try {
    hotkeys.setBinding(initial.hotkey, initial.hotkeyMode)
  } catch (error) {
    overlayChanged({
      ...emptyOverlay(),
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not register the shortcut.'
    })
  }

  ipcMain.handle(IPC.GET_STATE, () => ({
    settings: store.getSettings(),
    history: store.getHistory(),
    version: app.getVersion(),
    update: updater.getStatus(),
    overlay: overlayState,
    usage: usage.snapshot()
  }))

  const requireMain = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== mainWindow?.webContents)
      throw new Error('Speech cues are only available from the main app.')
  }
  ipcMain.handle(IPC.ANALYZE_CUES, (event, id: string, range: CueRequest) => {
    requireMain(event)
    if (extrasPaused(usage.snapshot().records, store.getSettings().monthlyLimitUsd))
      throw new Error(LIMIT_REACHED)
    return speechCues.run(id, range)
  })
  ipcMain.handle(IPC.CANCEL_CUES, (event, id: string) => {
    requireMain(event)
    speechCues.cancel(id)
  })
  ipcMain.handle(IPC.CUE_FEEDBACK, (event, id: string, analysisId: string, patch: CueFeedback) => {
    requireMain(event)
    return speechCues.feedback(id, analysisId, patch)
  })
  ipcMain.handle(IPC.CLEAR_CUES, (event, id: string) => {
    requireMain(event)
    return speechCues.clear(id)
  })
  ipcMain.handle(IPC.CUE_MODELS, (event) => {
    requireMain(event)
    const key = store.getSettings().apiKey
    if (!key.trim()) throw new Error('Save your OpenRouter key first.')
    return fetchCueModels(key)
  })

  const requireOutputWindow = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== mainWindow?.webContents && event.sender !== overlayWindow?.webContents)
      throw new Error('Output controls are available only in the app and HUD.')
  }
  ipcMain.handle(IPC.SAVE_OUTPUT, (event, value: OutputPreferences) => {
    requireOutputWindow(event)
    // Presentation preferences can change mid-recording without changing the capture snapshot.
    const settings = store.saveSettings({ output: normalizeOutputPreferences(value) })
    broadcastSettings()
    return settings
  })
  ipcMain.handle(IPC.COPY_OUTPUT, (event, id: string, format: 'plain' | 'tags' | 'json') => {
    requireOutputWindow(event)
    if (!['plain', 'tags', 'json'].includes(format)) throw new Error('Unsupported copy format.')
    const item = store.getHistory().find((row) => row.id === id)
    if (!item) throw new Error('This take is no longer available.')
    const settings = store.getSettings()
    const copyItem = item.unconfirmedText?.trim()
      ? {
          ...item,
          text: joinUtterances([
            item.text,
            applyVocabulary(item.unconfirmedText, settings.vocabulary)
          ])
        }
      : item
    return copyTranscript(renderOutput(copyItem, settings.output, format))
  })

  ipcMain.handle(IPC.SAVE_SETTINGS, (_event, patch: Partial<AppSettings>) => {
    // Your voice can be edited mid-session: personal words apply to what is not typed yet.
    const wordsOnly =
      !!patch &&
      typeof patch === 'object' &&
      Object.keys(patch).length > 0 &&
      Object.keys(patch).every((key) => key === 'vocabulary' || key === 'dismissedSuggestions')
    if (wordsOnly && !recoveryBusy) {
      const settings = store.saveSettings(patch)
      dictation.updateVocabulary(settings.vocabulary)
      broadcastSettings()
      return settings
    }
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish the current recording or recovery before changing settings.')
    const previous = store.getSettings()
    const requested = normalizeSettings({ ...previous, ...patch })
    hotkeys.setBinding(requested.hotkey, requested.hotkeyMode)
    let settings: AppSettings
    try {
      settings = store.saveSettings(patch)
    } catch (error) {
      hotkeys.setBinding(previous.hotkey, previous.hotkeyMode)
      throw error
    }
    applyStartup(settings)
    if (overlayWindow) sizeOverlay(overlayWindow, settings.hud)
    broadcastSettings()
    if (patch.speechCues || patch.apiKey !== undefined) speechCues.cancel()
    if (patch.autoUpdate === true) {
      void updater.check({ force: true, download: true })
    }
    return settings
  })

  // Only programs already in History, so this cannot be used to probe arbitrary paths.
  const appIcons = new Map<string, string | null>()
  ipcMain.handle(IPC.VOICE_MEMORY_GET, () => voiceMemoryState())
  ipcMain.handle(IPC.HUD_DIAGNOSTICS, (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Not allowed.')
    const settings = store.getSettings()
    const displays = screen.getAllDisplays().map((d) => `${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}`)
    return [
      `S2Teasy ${app.getVersion()} · Windows ${process.getSystemVersion()} · displays ${displays.join(', ')}`,
      `HUD style=${settings.hud.style} layout=${settings.hud.whileTalking} position=${settings.overlayPosition} scale=${settings.hud.scale}`,
      ...hudLog
    ].join('\n')
  })
  ipcMain.handle(IPC.VOICE_MEMORY_FORGET, (event, kind: unknown, id: unknown) => {
    if (event.sender !== mainWindow?.webContents || typeof id !== 'string') throw new Error('Not allowed.')
    if (kind === 'example') voiceMemory.forgetExample(id)
    else if (kind === 'memory') voiceMemory.forgetMemory(id)
    else if (kind === 'all') voiceMemory.clear()
  })
  ipcMain.handle(IPC.APP_ICON, async (_event, exe: unknown) => {
    if (typeof exe !== 'string' || !store.getHistory().some((row) => row.app?.exe === exe)) return null
    if (!appIcons.has(exe)) {
      try {
        const icon = await app.getFileIcon(exe, { size: 'normal' })
        appIcons.set(exe, icon.isEmpty() ? null : icon.toDataURL())
      } catch {
        appIcons.set(exe, null)
      }
    }
    return appIcons.get(exe) ?? null
  })

  // Allowed mid-session: the HUD teaches words while you talk. Only the vocabulary changes.
  ipcMain.handle(IPC.LEARN_WORD, (_event, request: LearnWordRequest) => {
    if (!request || typeof request !== 'object') throw new Error('Nothing to remember.')
    const heard = typeof request.heard === 'string' ? request.heard.slice(0, 120) : ''
    const meant = typeof request.meant === 'string' ? request.meant.slice(0, 120) : ''
    const kind: WordKind = WORD_KINDS.includes(request.kind) ? request.kind : 'name'
    const clip =
      request.clip &&
      typeof request.clip.sessionId === 'string' &&
      Number.isFinite(request.clip.startMs) &&
      Number.isFinite(request.clip.endMs) &&
      store.getHistory().some((row) => row.id === request.clip!.sessionId && row.hasAudio)
        ? { ...request.clip, createdAt: Date.now() }
        : undefined
    const vocabulary = learnFix(
      store.getSettings().vocabulary,
      { heard, meant, kind, clip },
      () => randomUUID()
    )
    const settings = store.saveSettings({ vocabulary })
    dictation.updateVocabulary(settings.vocabulary)
    broadcastSettings()
    return settings
  })

  ipcMain.handle(IPC.DELETE_HISTORY, (_event, id: string) => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish recording or recovery before deleting history.')
    speechCues.cancel(id)
    journal.delete(id)
    const history = store.deleteHistory(id)
    broadcastHistory()
    return history
  })

  ipcMain.handle(IPC.CLEAR_HISTORY, () => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish recording or recovery before clearing history.')
    speechCues.cancel()
    for (const item of store.getHistory()) journal.delete(item.id)
    const history = store.clearHistory()
    broadcastHistory()
    return history
  })

  ipcMain.handle(IPC.EXPORT_USAGE, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export usage',
      defaultPath: 'S2Teasy-usage.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return false
    writeFileSync(result.filePath, usageCsv(usage.snapshot().records), 'utf8')
    return true
  })
  ipcMain.handle(IPC.TEST_KEY, (_event, key: string) => testApiKey(key))
  ipcMain.handle(IPC.TEST_ROUTER_KEY, (_event, key: string, provider?: RouterProvider) =>
    testRouterAudioKey(key, provider ?? 'auto')
  )
  ipcMain.handle(IPC.FETCH_MODELS, (_event, key: string) => fetchTranscriptionModels(key))
  ipcMain.handle(IPC.TOGGLE_DICTATION, async () => {
    if (!dictation.isBusy() && mainWindow?.isFocused()) {
      mainWindow.hide()
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    dictation.toggle()
  })
  ipcMain.handle(IPC.START_PRACTICE, (_event, text: string) => dictation.startPractice(text))
  ipcMain.handle(IPC.REVIEW_DICTATION, () => dictation.reviewCurrent())
  ipcMain.handle(IPC.STOP_RECORDING, () => dictation.stop())
  ipcMain.handle(IPC.HUD_EDIT, (_event, sessionId: string, start: number, end: number, text: string) => {
    if (typeof sessionId !== 'string' || typeof text !== 'string' || text.length > 400)
      throw new Error('That edit could not be applied.')
    return dictation.editText(sessionId, start, end, text)
  })
  ipcMain.handle(IPC.HUD_PAUSE, () => {
    logHud(`HUD pause (paused=${dictation.isPaused()}, status=${overlayState.status})`)
    if (dictation.isPaused()) return dictation.resume()
    dictation.pause()
  })
  ipcMain.handle(IPC.HUD_FINISH, () => {
    logHud(`HUD done (status=${overlayState.status}, message=${overlayState.message})`)
    if (demoTimers.length) stopHudDemo(true)
    else dictation.finish()
  })
  ipcMain.handle(IPC.HUD_DEMO, (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Not allowed.')
    showHudDemo()
  })
  ipcMain.on(IPC.HUD_HOLD, (event, held: unknown) => {
    if (event.sender === overlayWindow?.webContents) dictation.holdFinish(held === true)
  })
  ipcMain.handle(IPC.HUD_CUES, (_event, on: unknown) => dictation.setSessionCues(on === true))
  ipcMain.handle(IPC.HUD_FOCUS, (_event, focus: unknown) => {
    logHud(`HUD focus ${focus === true ? 'take' : 'release'}`)
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (focus === true) {
      hudEditing = true
      overlayWindow.setFocusable(true)
      syncHudClicks()
      // focus() alone loses to the app in front on Windows, and typing would go there instead.
      bringToFront(overlayWindow.getNativeWindowHandle())
      overlayWindow.focus()
      overlayWindow.webContents.focus()
    } else {
      hudEditing = false
      overlayWindow.setFocusable(false)
      overlayWindow.blur()
      dictation.restoreTarget()
    }
    // Focus changes can reset click-through on Windows: re-apply the wanted state right away.
    hudTakesClicks = null
    syncHudClicks()
  })
  ipcMain.on(IPC.HUD_POINTER, (event, inside: unknown) => {
    if (event.sender === overlayWindow?.webContents) logHud(`DOM pointer ${inside === true ? 'enter' : 'leave'}`)
  })
  ipcMain.on(IPC.HUD_AREA, (event, area: unknown) => {
    if (!overlayWindow || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) return
    const a = area as { x: number; y: number; width: number; height: number } | null
    if (!a !== !hudArea) logHud(`HUD area ${a ? JSON.stringify(a) : 'cleared'}`)
    hudArea =
      a && [a.x, a.y, a.width, a.height].every((n) => typeof n === 'number' && Number.isFinite(n)) ? a : null
    syncHudClicks()
  })
  // Transparent parts of the HUD window let clicks through to the app underneath. Windows does not
  // reliably tell a click-through window where the pointer is, so check the cursor position here.
  setInterval(syncHudClicks, 33)
  ipcMain.handle(IPC.CANCEL_RECORDING, () => dictation.cancel())
  ipcMain.handle(IPC.COPY_HISTORY, (event, text: string) => {
    if (event.sender === overlayWindow?.webContents) logHud(`HUD copy (${String(text).length} chars)`)
    return copyTranscript(text)
  })
  ipcMain.handle(IPC.INSERT_HISTORY, (_event, text: string) => dictation.insertNow(text))
  ipcMain.handle(IPC.GET_UPDATE, () => updater.getStatus())
  ipcMain.handle(IPC.CHECK_UPDATE, (_event, download?: boolean) =>
    updater.check({ force: true, download: Boolean(download) || store.getSettings().autoUpdate })
  )
  ipcMain.handle(IPC.INSTALL_UPDATE, () => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish your recording or recovery before restarting for an update.')
    return updater.install()
  })
  ipcMain.handle(IPC.OPEN_UPDATE_INSTALLER, (event) => {
    requireMain(event)
    if (dictation.isBusy() || recoveryBusy || speechCues.isBusy())
      throw new Error('Finish recording, recovery or cue analysis before installing.')
    return updater.openInstaller()
  })
  ipcMain.handle(IPC.OPEN_UPDATE_DIAGNOSTICS, (event) => {
    requireMain(event)
    return updater.openDiagnostics()
  })
  ipcMain.handle(IPC.GET_UPDATE_DIAGNOSTICS, (event) => {
    requireMain(event)
    return updater.diagnostics()
  })

  protocol.handle('s2t-audio', (request) => {
    const url = new URL(request.url)
    const id = url.pathname.slice(1)
    if (
      url.hostname !== 'session' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(id) ||
      !store.getHistory().some((row) => row.id === id)
    )
      return new Response(null, { status: 404 })
    try {
      return audioResponse(pcmToWav(journal.readPcm(id)), request.headers.get('range'))
    } catch {
      return new Response(null, { status: 404 })
    }
  })
  ipcMain.handle(IPC.WORD_EXAMPLE, (_event, id: string, index: number, intended: string) => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish recording before keeping a word example.')
    const item = store.getHistory().find((row) => row.id === id)
    if (!item || !journal.hasAudio(id)) throw new Error('Retained audio is unavailable.')
    const example = wordExample(item, journal.readPcm(id), index, intended, randomUUID())
    journal.append(example.item.id, example.pcm)
    journal.save(example.item)
    store.addHistory(example.item)
    broadcastHistory()
    return store.getHistory()
  })
  ipcMain.handle(IPC.EDIT_HISTORY, (_event, id: string, text: string) => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish recording or recovery before editing history.')
    const item = store.getHistory().find((row) => row.id === id)
    if (!item || typeof text !== 'string' || text.length > 1_000_000)
      throw new Error('Invalid transcript.')
    const next = {
      ...item,
      rawText: item.rawText ?? item.text,
      text,
      // Audio cue ranges stay valid; provider word alignment does not survive free text edits.
      words: text === item.text ? item.words : undefined
    }
    journal.save(next)
    store.addHistory(next)
    broadcastHistory()
    return store.getHistory()
  })
  ipcMain.handle(IPC.RECOVER_HISTORY, async (_event, id: string) => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish the current recording or recovery first.')
    const item = store.getHistory().find((row) => row.id === id)
    if (!item || !journal.hasAudio(id))
      throw new Error('No retained audio is available for this session.')
    const settings = structuredClone(store.getSettings())
    if (settings.sttEngine === 'router-audio')
      throw new Error(
        'Choose OpenRouter or Local speech in Settings to recover saved audio. Recovery does not paste into other apps.'
      )
    recoveryBusy = true
    try {
      const audio = journal.readPcm(id)
      const parts: string[] = []
      const words: WordTiming[] = []
      store.addHistory({ ...item, status: 'processing', error: undefined })
      broadcastHistory()
      // Bounded 15-second requests avoid the original full-recording timeout problem.
      const chunkBytes = 15 * 16000 * 2
      for (let offset = 0; offset < audio.length; offset += chunkBytes) {
        parts.push(
          await transcribeAudio({
            engine: settings.sttEngine,
            apiKey: settings.apiKey,
            model: settings.sttEngine === 'local' ? settings.localModel : settings.model,
            localEndpoint: settings.localEndpoint,
            language: settings.language,
            wavBase64: pcmToWav(audio.subarray(offset, offset + chunkBytes)).toString('base64'),
            route: settings.openrouterRoute,
            requestWordTimings: settings.requestWordTimings,
            onWords: (chunkWords) =>
              words.push(
                ...chunkWords.map((word) => ({
                  ...word,
                  startMs: word.startMs + offset / 32,
                  endMs: word.endMs + offset / 32
                }))
              ),
            onUsage: (row) =>
              sendMain(
                IPC.USAGE_CHANGED,
                usage.record({ ...row, sessionId: id, source: 'recovery' })
              ),
            vocabulary: engineHintTerms(settings.vocabulary)
          })
        )
      }
      const rawText = joinUtterances(parts)
      if (!rawText)
        throw new Error(
          'The selected engine returned no speech. Your previous transcript and audio are preserved.'
        )
      const next: HistoryItem = {
        ...item,
        rawText,
        text:
          item.source === 'practice' ? item.text : applyVocabulary(rawText, settings.vocabulary),
        status: 'complete',
        words,
        unconfirmedText: undefined,
        error: undefined
      }
      journal.save(next)
      if (!settings.keepAudioForTraining && item.source !== 'practice') journal.removeAudio(id)
      next.hasAudio = journal.hasAudio(id)
      journal.save(next)
      store.addHistory(next)
    } catch (error) {
      const next: HistoryItem = {
        ...item,
        status: 'error',
        error: error instanceof Error ? error.message : 'Recovery failed.'
      }
      journal.save(next)
      store.addHistory(next)
      throw error
    } finally {
      recoveryBusy = false
      broadcastHistory()
    }
    return store.getHistory()
  })
  ipcMain.handle(IPC.EXPORT_AUDIO, async (_event, id: string) => {
    if (dictation.isBusy() || recoveryBusy)
      throw new Error('Finish recording or recovery before exporting.')
    const item = store.getHistory().find((row) => row.id === id)
    if (!item || !journal.hasAudio(id)) throw new Error('No retained audio is available.')
    const result = await dialog.showSaveDialog({
      title: 'Export audio and corrected transcript',
      defaultPath: `s2teasy-${id}.wav`,
      filters: [{ name: 'WAV audio', extensions: ['wav'] }]
    })
    if (result.canceled || !result.filePath) return false
    writeFileSync(result.filePath, pcmToWav(journal.readPcm(id)))
    writeFileSync(
      `${result.filePath}.json`,
      JSON.stringify(
        {
          text: item.text,
          rawText: item.rawText,
          practiceTarget: item.practiceTarget,
          model: item.model,
          sampleRate: 16000,
          language: store.getSettings().language
        },
        null,
        2
      )
    )
    return true
  })

  // Audio channels accept messages only from the hidden recorder and carry the session generation.
  ipcMain.on(IPC.AUDIO_LEVEL, (event, data: { payload: AudioLevelPayload; sessionId: number }) => {
    if (event.sender === recorderWindow?.webContents)
      dictation.setLevel(data.payload, data.sessionId)
  })
  ipcMain.on(IPC.AUDIO_PCM, (event, data: { bytes: ArrayBuffer; sessionId: number }) => {
    if (event.sender === recorderWindow?.webContents)
      dictation.onPcm(new Uint8Array(data.bytes), data.sessionId)
  })
  ipcMain.on(
    IPC.AUDIO_UTTERANCE,
    (event, data: { wavBase64: string; sessionId: number; startMs?: number }) => {
      if (event.sender === recorderWindow?.webContents)
        void dictation.onUtterance(data.wavBase64, data.sessionId, data.startMs)
    }
  )
  ipcMain.on(
    IPC.RECORDING_FINISHED,
    (
      event,
      data: {
        leftoverBase64: string
        fullBase64: string
        durationMs: number
        sessionId: number
        leftoverStartMs?: number
      }
    ) => {
      if (event.sender === recorderWindow?.webContents)
        void dictation.onFinished(
          data.leftoverBase64,
          data.fullBase64,
          data.durationMs,
          data.sessionId,
          data.leftoverStartMs
        )
    }
  )
  ipcMain.on(IPC.RECORDING_ERROR, (event, data: { message: string; sessionId: number }) => {
    if (event.sender === recorderWindow?.webContents)
      dictation.recordingError(data.message, data.sessionId)
  })

  if (
    (store.getSettings().sttEngine !== 'local' &&
      !store.getSettings().apiKey &&
      !store.getSettings().routerAudioKey) ||
    updater.getStatus().phase === 'error'
  ) {
    mainWindow.show()
  }
  if (store.getSettings().autoUpdate && updater.getStatus().phase !== 'error') {
    setTimeout(() => void updater.check({ download: true }), 4000)
  }
}

if (e2eEnabled) {
  // A synthetic microphone and a separate profile, so tests never touch real devices or data.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  if (process.env.S2T_E2E_USER_DATA) app.setPath('userData', process.env.S2T_E2E_USER_DATA)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('com.s2teasy.app')
    return setup()
  })
  app.on('before-quit', () => {
    quitting = true
    hotkeys.stop()
    if (dictation?.isBusy()) dictation.cancel()
    overlayWindow?.destroy()
    recorderWindow?.destroy()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && quitting) app.quit()
  })
  app.on('activate', () => {
    mainWindow?.show()
  })
}
