import { emptyUsage, type UsageState } from '@shared/usage'
import { TranscriptReview } from './TranscriptReview'
import { UsagePanel } from './UsagePanel'
import { useEffect, useMemo, useState } from 'react'
import { formatHotkey } from '@shared/hotkey'
import {
  defaultSettings,
  emptyOverlay,
  idleUpdate,
  type AppSettings,
  type HistoryItem,
  type OverlayState,
  type UpdateStatus
} from '@shared/types'
import { HistoryPanel } from './HistoryPanel'
import { SettingsPanel, type SettingsSection } from './SettingsPanel'
import { WelcomeTour } from './WelcomeTour'
import { startError } from '@shared/engine'
import { VocabularyPanel } from './VocabularyPanel'
import { PracticePanel } from './PracticePanel'

const preview = import.meta.env.VITE_BROWSER_PREVIEW === '1'
type Tab = 'overview' | 'history' | 'vocabulary' | 'practice' | 'settings' | 'usage'

export function App() {
  const [tourDismissed, setTourDismissed] = useState(false)
  const [replayTour, setReplayTour] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('engine')
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [practiceTarget, setPracticeTarget] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings())
  const [usage, setUsage] = useState<UsageState>(emptyUsage)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [overlay, setOverlay] = useState<OverlayState>(emptyOverlay())
  const [update, setUpdate] = useState<UpdateStatus>(idleUpdate())
  const [version, setVersion] = useState('')
  const [toast, setToast] = useState('')
  const [ready, setReady] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const active = ['listening', 'transcribing', 'inserting'].includes(overlay.status)
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
      .catch(() =>
        setToast('Could not load app data. Restart the app; local session files are preserved.')
      )
    const off = [
      window.s2t.onReview((id) => {
        setReviewId(id)
        setTab('history')
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
  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section)
    setTab('settings')
  }
  const showTour = () => {
    if (active) {
      setToast('Finish the current recording before opening the tour.')
      return
    }
    setReplayTour(true)
  }
  const grouped = useMemo(() => groupHistory(history), [history])
  const save = async (patch: Partial<AppSettings>) => {
    try {
      setSettings(await window.s2t.saveSettings(patch))
    } catch (error) {
      setToast(message(error))
      throw error
    }
  }
  // Event handlers call safeSave; editors need the rejecting promise to preserve unsaved input.
  const safeSave = async (patch: Partial<AppSettings>) => {
    try {
      await save(patch)
    } catch {
      /* toast contains the error */
    }
  }
  const run = async (action: () => Promise<unknown>) => {
    setActionBusy(true)
    try {
      await action()
    } catch (error) {
      setToast(message(error))
    } finally {
      setActionBusy(false)
    }
  }
  const addWord = async (heard: string, meant: string) => {
    if (settings.vocabulary.some((row) => row.heard.toLowerCase() === heard.trim().toLowerCase()))
      throw new Error('A rule already exists for that phrase. Manage it in Vocabulary.')
    await save({
      vocabulary: [
        ...settings.vocabulary,
        { id: crypto.randomUUID(), heard: heard.trim(), meant: meant.trim(), enabled: true }
      ]
    })
    setToast('Correction remembered')
  }
  const hasKey =
    settings.sttEngine === 'local' ||
    (settings.sttEngine === 'router-audio' ? !!settings.routerAudioKey : !!settings.apiKey)
  const wordCount = history.reduce(
    (n, item) => n + (item.text.trim() ? item.text.trim().split(/\s+/).length : 0),
    0
  )
  const minutes = Math.round(history.reduce((n, item) => n + item.durationMs, 0) / 60000)
  return (
    <div className="app">
      <div className="drag" />
      <aside className="rail">
        <div className="brand">
          <Logo />
          <div>
            <h1>S2Teasy</h1>
            <span>Room to think.</span>
          </div>
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav className="nav" aria-label="Main navigation">
          {(
            [
              ['overview', 'Overview', '◫'],
              ['history', 'History', '◷'],
              ['usage', 'Usage & spend', '↗'],
              ['vocabulary', 'Vocabulary', 'Aa'],
              ['practice', 'Voice practice', '≋'],
              ['settings', 'Settings', '⚙']
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              aria-label={label}
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              <span>
                <i className="nav-icon" aria-hidden="true">
                  {icon}
                </i>
                {label}
              </span>
              {id === 'history' && history.length > 0 && <small>{history.length}</small>}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="shortcut-label">A thought away</span>
          <div className="kbd">
            {formatHotkey(settings.hotkey)
              .split(' + ')
              .map((part) => (
                <kbd key={part}>{part}</kbd>
              ))}
          </div>
          <p>
            {settings.hotkeyMode === 'hold'
              ? 'Hold your shortcut to speak.'
              : 'Press to speak. Press again to finish.'}
          </p>
        </div>
        <div className="rail-bottom">
          <span className="local-dot" />
          Stored on your device<span className="version">v{version || '…'}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-bar">
          <span>
            {settings.displayName ? `${settings.displayName}’s workspace` : 'Personal workspace'}{' '}
            <span className="breadcrumb">/ {tab[0].toUpperCase() + tab.slice(1)}</span>
          </span>
          <span className={active ? 'connection active' : 'connection'}>
            <i />
            {active ? overlay.message : hasKey ? 'Ready when you are' : 'Connect a speech engine'}
          </span>
        </header>
        <main className="panel">
          {preview && (
            <div className="notice preview-notice">
              Interface preview · sample history and simulated spend · desktop dictation, secure key
              storage, and recovery require the Electron app.
            </div>
          )}
          {tab === 'overview' && (
            <>
              <div className="panel-head">
                <div>
                  <span className="eyebrow">
                    {settings.displayName
                      ? `Welcome back, ${settings.displayName}.`
                      : 'Less typing. More thinking.'}
                  </span>
                  <h2>Good ideas move fast.</h2>
                  <p>Give your thoughts somewhere to land.</p>
                </div>
                <span className="subtle-tag">Windows dictation</span>
              </div>
              <section className="dictation-hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <i />
                    {active ? 'YOUR MIC IS ON' : 'YOUR VOICE, IN FLOW'}
                  </span>
                  <h3>
                    Say it.
                    <br />
                    <span>Keep the thought.</span>
                  </h3>
                  <p>
                    Speak naturally. Watch your words appear.
                    <br />
                    Keep a local copy you can come back to.
                  </p>
                  <div className="inline">
                    <button
                      className="primary record-button"
                      disabled={!ready || actionBusy || (preview && hasKey)}
                      onClick={() => {
                        if (!hasKey) {
                          setTab('settings')
                          return
                        }
                        void run(() => window.s2t.toggleDictation())
                      }}
                    >
                      <span aria-hidden="true">{active ? '■' : '●'}</span>
                      {active
                        ? 'Finish dictation'
                        : hasKey
                          ? 'Start dictation'
                          : 'Set up your engine'}
                      <span aria-hidden="true">↗</span>
                    </button>
                    <span className="micro">or {formatHotkey(settings.hotkey)}</span>
                  </div>
                </div>
                <div className={active ? 'voice-art recording' : 'voice-art'} aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <div className="voice-core">
                    <Logo />
                  </div>
                  <div className="voice-wave">
                    {[8, 14, 26, 40, 23, 50, 34, 18, 42, 58, 32, 18, 10].map((h, i) => (
                      <i key={i} style={{ height: h, animationDelay: `${i * 60}ms` }} />
                    ))}
                  </div>
                  <span className="voice-caption">SPEAK FREELY.</span>
                </div>
              </section>
              {!settings.setupChecklistDismissed && (
                <section className="setup-card" aria-label="Getting started">
                  <div className="setup-card-head">
                    <div>
                      <span className="eyebrow">A FEW SMALL STEPS</span>
                      <h3>Find your flow.</h3>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => void safeSave({ setupChecklistDismissed: true })}
                    >
                      Hide checklist
                    </button>
                  </div>
                  <p>
                    Set up your engine, check your microphone, and try a thought in a text field.
                  </p>
                  <div className="setup-actions">
                    <button onClick={() => openSettings('engine')}>
                      <span>{startError(settings) ? '01 / SET UP' : '✓ / CONFIGURED'}</span>
                      <strong>Choose a speech engine →</strong>
                      <small>
                        Bring a provider key or configure a local server. Configuration isn’t a
                        connection test.
                      </small>
                    </button>
                    <button onClick={() => openSettings('dictation')}>
                      <span>02 / CHECK YOUR INPUT</span>
                      <strong>Test your microphone →</strong>
                      <small>
                        Watch the local volume meter and set your shortcut. No audio is uploaded by
                        the meter.
                      </small>
                    </button>
                    <button onClick={showTour}>
                      <span>
                        {history.some(
                          (row) =>
                            row.source !== 'practice' &&
                            row.status === 'complete' &&
                            row.text.trim()
                        )
                          ? '✓ / FIRST WORDS SAVED'
                          : '03 / YOUR FIRST WORDS'}
                      </span>
                      <strong>Take the quick tour →</strong>
                      <small>
                        Focus a text field, use your shortcut, and explore Copy, Review, and
                        History.
                      </small>
                    </button>
                  </div>
                </section>
              )}
              <div className="stats-grid">
                <Stat
                  value={wordCount.toLocaleString()}
                  label="Words captured"
                  detail="A little less time at the keyboard"
                />
                <Stat
                  value={history.length.toString()}
                  label="Saved sessions"
                  detail="Searchable, editable, yours"
                />
                <Stat
                  value={`${minutes} min`}
                  label="Time speaking"
                  detail="Based on your saved history"
                />
              </div>
              {(active || overlay.status === 'error') && (
                <section className="block live-transcript" role="status">
                  <div className="section-heading">
                    <h3>
                      {overlay.status === 'error' ? 'Recording needs attention' : 'Live transcript'}
                    </h3>
                    <span className="session-badge recording">{overlay.message}</span>
                  </div>
                  <p>{overlay.partial || 'Listening for your words…'}</p>
                  {active && (
                    <button
                      className="ghost"
                      onClick={() => void run(() => window.s2t.cancelRecording())}
                    >
                      Cancel and keep saved text
                    </button>
                  )}
                </section>
              )}
              <div className="section-heading">
                <h3>Recent thoughts</h3>
                <button className="text-button" onClick={() => setTab('history')}>
                  View all history <span aria-hidden="true">→</span>
                </button>
              </div>
              {history.length ? (
                <div className="recent-list">
                  {history.slice(0, 3).map((item) => (
                    <button key={item.id} onClick={() => setTab('history')}>
                      <span className="recent-icon" aria-hidden="true">
                        ≋
                      </span>
                      <span>
                        <strong>{item.text || 'Unfinished session'}</strong>
                        <small>
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric'
                          })}{' '}
                          · {item.status ?? 'saved'}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="getting-started">
                  <span className="step-number">01</span>
                  <div>
                    <h3>Your first thought goes here.</h3>
                    <p>
                      Connect an engine in Settings, focus any text field, and use your shortcut.
                    </p>
                  </div>
                  <button className="ghost" onClick={() => setTab('settings')}>
                    Open settings →
                  </button>
                </div>
              )}
              <div className="privacy-footnote">
                <span aria-hidden="true">◇</span>
                {settings.recoveryAudio
                  ? 'Recovery audio stays on this device and expires automatically.'
                  : 'Audio recovery is off. Only finalized text is saved.'}{' '}
                Training retention is {settings.keepAudioForTraining ? 'on' : 'off'}.
              </div>
            </>
          )}
          {tab === 'usage' && (
            <UsagePanel usage={usage} onExport={() => void run(() => window.s2t.exportUsage())} />
          )}
          {tab === 'history' && (
            <HistoryPanel
              grouped={grouped}
              onCopy={(text) =>
                void run(async () => {
                  await window.s2t.copyHistory(text)
                  setToast('Copied to clipboard')
                })
              }
              onInsert={(text) => void run(() => window.s2t.insertHistory(text))}
              onDelete={(id) =>
                void run(async () => setHistory(await window.s2t.deleteHistory(id)))
              }
              onClear={() => void run(async () => setHistory(await window.s2t.clearHistory()))}
              onReview={setReviewId}
              onRecover={async (id) => {
                setHistory(await window.s2t.recoverHistory(id))
                setToast('Recovered. Review the text before inserting.')
              }}
              onExport={(id) =>
                void run(async () => {
                  if (await window.s2t.exportAudio(id))
                    setToast('Audio and labeled transcript exported')
                })
              }
            />
          )}
          {tab === 'vocabulary' && (
            <VocabularyPanel
              displayName={settings.displayName}
              entries={settings.vocabulary}
              onChange={async (vocabulary) => save({ vocabulary })}
            />
          )}
          {tab === 'practice' && (
            <PracticePanel
              key={practiceTarget}
              initialTarget={practiceTarget}
              settings={settings}
              history={history}
              overlay={overlay}
              onHistory={() => setTab('history')}
            />
          )}
          {tab === 'settings' && (
            <SettingsPanel
              key={settingsSection}
              initialSection={settingsSection}
              onProfileSave={(displayName) => save({ displayName })}
              onReplayTour={showTour}
              settings={settings}
              update={update}
              onChange={save}
              onUpdate={setUpdate}
              ready={ready}
              onToast={setToast}
            />
          )}
        </main>
      </div>
      {ready &&
        !active &&
        !reviewId &&
        (replayTour || (!settings.welcomeCompleted && !tourDismissed)) && (
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
              if (destination === 'engine') openSettings('engine')
              else setTab('overview')
            }}
          />
        )}
      {reviewId && history.find((row) => row.id === reviewId) && (
        <TranscriptReview
          settings={settings}
          onHistory={setHistory}
          onConfigureCues={() => {
            setReviewId(null)
            openSettings('intelligence')
          }}
          key={reviewId}
          item={history.find((row) => row.id === reviewId)!}
          onClose={() => setReviewId(null)}
          onSave={async (text) => {
            setHistory(await window.s2t.editHistory(reviewId, text))
          }}
          onRemember={addWord}
          onPractice={(text) => {
            setPracticeTarget(text)
            setReviewId(null)
            setTab('practice')
          }}
          onExample={async (index, intended) => {
            setHistory(await window.s2t.saveWordExample(reviewId, index, intended))
            setToast('Labeled clip saved in Voice practice')
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="13" fill="currentColor" />
      <path
        d="M10 19v3m5-9v15m5-19v22m5-17v12m5-7v3"
        stroke="var(--logo-ink, #071a18)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
function Stat({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}
function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Could not complete that action. Please try again.'
}
export type GroupedHistory = { label: string; items: HistoryItem[] }[]
export function groupHistory(items: HistoryItem[]): GroupedHistory {
  const groups = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const label = dayLabel(item.createdAt)
    const list = groups.get(label) ?? []
    list.push(item)
    groups.set(label, list)
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, items: rows }))
}
function dayLabel(ts: number): string {
  const date = new Date(ts),
    today = new Date(),
    yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
