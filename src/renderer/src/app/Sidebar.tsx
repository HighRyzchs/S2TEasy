import type { ReactNode } from 'react'
import { formatHotkey } from '@shared/hotkey'
import type { OverlayStatus } from '@shared/types'
import {
  HistoryIcon,
  HomeIcon,
  HudIcon,
  Logo,
  SettingsIcon,
  UsageIcon,
  VoiceIcon
} from './icons'
import './sidebar.css'

export type Screen = 'home' | 'voice' | 'history' | 'usage' | 'hud' | 'settings'

const NAV: { id: Screen; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'voice', label: 'Your voice', icon: <VoiceIcon /> },
  { id: 'history', label: 'History', icon: <HistoryIcon /> },
  { id: 'usage', label: 'Usage', icon: <UsageIcon /> },
  { id: 'hud', label: 'HUD', icon: <HudIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> }
]

export function Sidebar({
  screen,
  onNavigate,
  hotkey,
  engineLabel,
  configured,
  status,
  voiceBadge,
  version
}: {
  screen: Screen
  onNavigate: (screen: Screen) => void
  hotkey: string
  engineLabel: string
  configured: boolean
  status: OverlayStatus
  voiceBadge: number
  version: string
}) {
  const live = status === 'listening' || status === 'transcribing' || status === 'inserting'
  const state = !configured
    ? { text: 'Set up a speech engine', tone: 'warn' }
    : live
      ? { text: 'Recording', tone: 'live' }
      : status === 'paused'
        ? { text: 'Paused', tone: 'live' }
        : { text: 'Ready', tone: 'ok' }
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar-brand">
        <Logo />
        <span>S2Teasy</span>
      </div>

      <button
        type="button"
        className="sidebar-status"
        onClick={() => onNavigate(configured ? 'home' : 'settings')}
      >
        <span className={`sidebar-dot ${state.tone}`} />
        <span className="sidebar-state">{state.text}</span>
        <span className="sidebar-keys">
          {formatHotkey(hotkey)
            .split(' + ')
            .map((key) => (
              <span key={key} className="kbd">
                {key}
              </span>
            ))}
        </span>
        <span className="sidebar-engine">{engineLabel}</span>
      </button>

      <div className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={screen === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'voice' && voiceBadge > 0 && (
              <span className="sidebar-badge" aria-label={`${voiceBadge} suggestions`}>
                {voiceBadge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <span>
          <i /> Everything stays on this PC
        </span>
        <span className="mono">v{version || '…'}</span>
      </div>
    </nav>
  )
}
