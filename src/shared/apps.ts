/** Friendly names for programs people commonly dictate into; anything else uses its file name. */
const KNOWN: Record<string, string> = {
  discord: 'Discord',
  slack: 'Slack',
  code: 'VS Code',
  cursor: 'Cursor',
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  brave: 'Brave',
  opera: 'Opera',
  notion: 'Notion',
  obsidian: 'Obsidian',
  winword: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  outlook: 'Outlook',
  olk: 'Outlook',
  onenote: 'OneNote',
  teams: 'Teams',
  'ms-teams': 'Teams',
  notepad: 'Notepad',
  'notepad++': 'Notepad++',
  windowsterminal: 'Terminal',
  wt: 'Terminal',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  vrchat: 'VRChat',
  steam: 'Steam',
  zoom: 'Zoom',
  figma: 'Figma',
  spotify: 'Spotify'
}

export type AppInfo = { name: string; exe: string }

export function appFromPath(path: string | null | undefined): AppInfo | undefined {
  if (!path || typeof path !== 'string') return undefined
  const file = path.split(/[\\/]/).pop() ?? ''
  const base = file.replace(/\.exe$/i, '')
  if (!base) return undefined
  const known = KNOWN[base.toLowerCase()]
  const name = known ?? base.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase())
  return { name: name.slice(0, 40), exe: path.slice(0, 400) }
}
