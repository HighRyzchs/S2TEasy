import type { ReactNode } from 'react'

/** Small stroke icons used across the app. Decorative unless the caller labels the button. */
function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const HomeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </Icon>
)
export const VoiceIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
  </Icon>
)
export const HistoryIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)
export const UsageIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
)
export const HudIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="14" width="18" height="6" rx="3" />
    <path d="M7 17h6" />
    <rect x="5" y="4" width="14" height="7" rx="1.5" />
  </Icon>
)
export const SettingsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" />
    <circle cx="16" cy="6" r="2.2" />
    <circle cx="10" cy="12" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
  </Icon>
)
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
  </Icon>
)
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)
export const MicIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3" />
  </Icon>
)
export const PlayIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4v16l13-8z" />
  </svg>
)
export const StopIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
)
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
)
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const AlertIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 17h.01" />
  </Icon>
)

export function Logo({ size = 34 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <path
        d="M10 19v3m5-9v15m5-19v22m5-17v12m5-7v3"
        stroke="var(--accent-ink)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
