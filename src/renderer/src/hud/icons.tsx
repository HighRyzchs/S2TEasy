const base = { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const

export const MicIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3" />
  </svg>
)

export const PauseIcon = () => (
  <svg {...base} fill="currentColor">
    <rect x="7" y="5" width="3.5" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1.2" />
  </svg>
)

export const CopyIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden focusable={false} fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="7" y="7" width="9" height="9" rx="2" />
    <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
  </svg>
)

export const CheckIcon = () => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden
    focusable={false}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 10 3.5 3.5L15 6.5" />
  </svg>
)

export const SpinnerIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
)

export const WarnIcon = () => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 7v6M12 17h.01" />
    <circle cx="12" cy="12" r="9" />
  </svg>
)
