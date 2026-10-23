import { analyzeAutomaticCues } from './automatic-cues'
import { normalizeOutputPreferences, renderOutput, type OutputPreferences } from '../shared/output'
import { copyTranscript } from './inject'
import { UsageStore } from './usage-store'
import { app, BrowserWindow, dialog, ipcMain, session, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import type { WordTiming } from '../shared/word-timing'
import { audioResponse } from './audio-response'
import { wordExample } from './word-example'
import { SpeechCueService } from './speech-cue-service'
import { fetchCueModels } from './speech-cue-model'
import type { CueRequest, CueFeedback } from '../shared/speech-cues'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { SessionJournal, pcmToWav } from './session-journal'
import { applyVocabulary } from '../shared/vocabulary'
import { joinUtterances } from '../shared/transcript'
import { emptyOverlay, normalizeSettings } from '../shared/types'
import { usageCsv } from '../shared/usage'
import { transcribeAudio } from './openrouter'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  AudioLevelPayload,
  HistoryItem,
  OverlayState,
  RouterProvider,
  UpdateStatus
} from '../shared/types'
import { DictationController } from './dictation'
import { HotkeyManager } from './hotkeys'
import { fetchTranscriptionModels, testApiKey } from './openrouter'
import { testRouterAudioKey } from './router-audio'
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
let store: Store
let dictation: DictationController
let updater: UpdateLauncher
let usage: UsageStore
let journal: SessionJournal
let speechCues: SpeechCueService
let recoveryBusy = false
let overlayState = emptyOverlay()
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
  sizeOverlay(overlayWindow, store.getSettings().overlayTheme)
  recorderWindow = createRecorderWindow()

  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  dictation = new DictationController({
    overlay: overlayWindow,
    journal,
    isRecovering: () => recoveryBusy,
    onUsage: (row) => sendMain(IPC.USAGE_CHANGED, usage.record(row)),
    onReview: (id) => {
      mainWindow?.show()
      mainWindow?.focus()
      sendMain(IPC.OPEN_REVIEW, id)
    },
    analyzeCompleted: (item, settings, signal) =>
      analyzeAutomaticCues(journal.readPcm(item.id), settings, signal, (row) =>
        sendMain(
          IPC.USAGE_CHANGED,
          usage.record({ ...row, sessionId: item.id, source: 'speech-cues' })
        )
      ),
    getSettings: () => store.getSettings(),
    onOverlay: overlayChanged,
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
        placeOverlay(overlayWindow, store.getSettings().overlayPosition, {
          x: store.getSettings().overlayOffsetX,
          y: store.getSettings().overlayOffsetY
        })
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
    onStart: () => void dictation.start(),
    onStop: () => dictation.stop(),
    onToggle: () => dictation.toggle()
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
    if (overlayWindow) sizeOverlay(overlayWindow, settings.overlayTheme)
    broadcastSettings()
    if (patch.speechCues || patch.apiKey !== undefined) speechCues.cancel()
    if (patch.autoUpdate === true) {
      void updater.check({ force: true, download: true })
    }
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
  ipcMain.handle(IPC.CANCEL_RECORDING, () => dictation.cancel())
  ipcMain.handle(IPC.COPY_HISTORY, (_event, text: string) => {
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
            vocabulary: settings.vocabulary.filter((row) => row.enabled).map((row) => row.meant)
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
