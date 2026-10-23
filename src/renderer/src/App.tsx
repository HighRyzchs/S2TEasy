import { useCallback, useEffect, useMemo, useState } from 'react'
import { emptyUsage, type UsageState } from '@shared/usage'
import {
  defaultSettings,
  emptyOverlay,
  idleUpdate,
  type AppSettings,
  type HistoryItem,
  type OverlayState,
  type UpdateStatus
} from '@shared/types'
import { TranscriptReview } from './TranscriptReview'
import { WelcomeTour } from './WelcomeTour'
import { AppContext, engineLabel, errorMessage, hasEngineKey, type AppData, type NavigateOptions } from './app/context'
import { Sidebar, type Screen } from './app/Sidebar'
import { voiceSuggestions } from './app/suggestions'
import { Home } from './app/screens/Home'
import { Voice } from './app/screens/Voice'
import { History } from './app/screens/History'
import { Usage } from './app/screens/Usage'
import { HudScreen } from './app/screens/HudScreen'
import { Settings } from './app/screens/Settings'

export { groupHistory, type GroupedHistory } from './app/history-groups'

const preview = import.meta.env.VITE_BROWSER_PREVIEW === '1'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [target, setTarget] = useState<NavigateOptions>({})
  const [tourDismissed, setTourDismissed] = useState(false)
  const [replayTour, setReplayTour] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings())
  const [usage, setUsage] = useState<UsageState>(emptyUsage)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [overlay, setOverlay] = useState<OverlayState>(emptyOverlay())
  const [update, setUpdate] = useState<UpdateStatus>(idleUpdate())
  const [version, setVersion] = useState('')
  const [toast, setToast] = useState('')
  const [ready, setReady] = useState(false)
  const active = ['listening', 'paused', 'transcribing', 'inserting'].includes(overlay.status)

  useEffect(() => {
    let alive = true
    void window.s2t
      .getState()
      .then((state) => {
        if (!alive) return
        setSettings(state.settings)
        setHistory(state.history)
        setUsage(state.usage ?? emptyUsage())
        setUpdate(state.update)
        setVersion(state.version)
        setOverlay(state.overlay ?? emptyOverlay())
        setReady(true)
      })
      .catch(() => setToast('Could not load app data. Restart the app; local session files are kept.'))
    const off = [
      window.s2t.onReview((id) => {
        setReviewId(id)
        setScreen('history')
      }),
      window.s2t.onSettings(setSettings),
      window.s2t.onUsage(setUsage),
      window.s2t.onHistory(setHistory),
      window.s2t.onUpdate(setUpdate),
      window.s2t.onOverlay(setOverlay)
    ]
    return () => {
      alive = false
      off.forEach((unsubscribe) => unsubscribe())
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    document.documentElement.dataset.appearance = settings.appearance
  }, [settings.appearance])

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      setSettings(await window.s2t.saveSettings(patch))
    } catch (error) {
      setToast(errorMessage(error))
      throw error
    }
  }, [])
  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (error) {
      setToast(errorMessage(error))
    }
  }, [])
  const navigate = useCallback((next: Screen, options: NavigateOptions = {}) => {
    setTarget(options)
    setScreen(next)
  }, [])
  const showTour = useCallback(() => {
    if (active) setToast('Finish the current recording before opening the tour.')
    else setReplayTour(true)
  }, [active])

  const data: AppData = useMemo(
    () => ({
      ready,
      preview,
      version,
      settings,
      history,
      usage,
      overlay,
      update,
      active,
      target,
      save,
      run,
      toast: setToast,
      navigate,
      openReview: setReviewId,
      setHistory,
      setUpdate,
      replayTour: showTour
    }),
    [ready, version, settings, history, usage, overlay, update, active, target, save, run, navigate, showTour]
  )
  const suggestions = useMemo(() => voiceSuggestions(history, settings.vocabulary, settings.dismissedSuggestions),
    [history, settings.vocabulary, settings.dismissedSuggestions]
  )
  const reviewItem = reviewId ? history.find((row) => row.id === reviewId) : undefined

  return (
    <AppContext.Provider value={data}>
      <div className="shell">
        <div className="drag-strip" />
        <Sidebar
          screen={screen}
          onNavigate={(next) => navigate(next)}
          hotkey={settings.hotkey}
          engineLabel={engineLabel(settings)}
          configured={hasEngineKey(settings)}
          status={overlay.status}
          voiceBadge={suggestions.length}
          version={version}
        />
        {screen === 'home' && <Home />}
        {screen === 'voice' && <Voice />}
        {screen === 'history' && <History />}
        {screen === 'usage' && <Usage />}
        {screen === 'hud' && <HudScreen />}
        {screen === 'settings' && <Settings />}
      </div>
      {ready && !active && !reviewId && (replayTour || (!settings.welcomeCompleted && !tourDismissed)) && (
        <WelcomeTour
          onDismiss={() => {
            setReplayTour(false)
            setTourDismissed(true)
            setToast('Preferences were not saved. You can replay the tour from Settings.')
          }}
          settings={settings}
          onFinish={async (patch, destination) => {
            await save(patch)
            setReplayTour(false)
            if (destination === 'engine') navigate('settings', { section: 'engine' })
            else navigate('home')
          }}
        />
      )}
      {reviewItem && (
        <TranscriptReview
          key={reviewItem.id}
          settings={settings}
          item={reviewItem}
          onHistory={setHistory}
          onConfigureCues={() => {
            setReviewId(null)
            navigate('voice', { tab: 'expression' })
          }}
          onClose={() => setReviewId(null)}
          onSave={async (text) => setHistory(await window.s2t.editHistory(reviewItem.id, text))}
          onRemember={async (heard, meant) => {
            await window.s2t.learnWord({ heard, meant, kind: 'name' })
            setToast('Remembered in Your voice')
          }}
          onPractice={(text) => {
            setReviewId(null)
            navigate('voice', { tab: 'practice', practice: text })
          }}
          onExample={async (index, intended) => {
            setHistory(await window.s2t.saveWordExample(reviewItem.id, index, intended))
            setToast('Labeled clip saved in Your voice')
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
    </AppContext.Provider>
  )
}
