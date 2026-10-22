import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { HISTORY_LIMIT } from '../shared/constants'
import { normalizeSettings, type AppSettings, type HistoryItem } from '../shared/types'
import { atomicJson } from './session-journal'

type Persisted = {
  settings: AppSettings
  history: HistoryItem[]
}

const FILE = 's2teasy.json'

function filePath(): string {
  return join(app.getPath('userData'), FILE)
}

function encrypt(value: string): string {
  if (!value) return ''
  try {
    if (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
    ) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`
    }
  } catch {
    // Refuse insecure persistence rather than writing a plaintext credential.
  }
  throw new Error(
    'OS credential encryption is unavailable. Enable the system keyring before saving API keys, or use Local speech.'
  )
}

function decrypt(value: string): string {
  if (!value) return ''
  try {
    if (value.startsWith('enc:')) {
      const buf = Buffer.from(value.slice(4), 'base64')
      return safeStorage.decryptString(buf)
    }
    if (value.startsWith('plain:')) return value.slice(6)
  } catch {
    return ''
  }
  return value
}

export class Store {
  private data: Persisted

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.data = this.read()
  }

  getSettings(): AppSettings {
    return { ...this.data.settings }
  }

  getHistory(): HistoryItem[] {
    return [...this.data.history]
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const previous = this.data.settings
    this.data.settings = normalizeSettings({ ...this.data.settings, ...patch })
    try {
      this.write()
    } catch (error) {
      this.data.settings = previous
      throw error
    }
    return this.getSettings()
  }

  addHistory(item: HistoryItem): HistoryItem[] {
    this.data.history = [item, ...this.data.history.filter((row) => row.id !== item.id)]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT)
    this.write()
    return this.getHistory()
  }

  deleteHistory(id: string): HistoryItem[] {
    this.data.history = this.data.history.filter((item) => item.id !== id)
    this.write()
    return this.getHistory()
  }

  clearHistory(): HistoryItem[] {
    this.data.history = []
    this.write()
    return []
  }

  private read(): Persisted {
    try {
      const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<Persisted> & {
        settings?: Partial<AppSettings>
      }
      const settings = normalizeSettings(raw.settings)
      settings.apiKey = decrypt(settings.apiKey ?? '')
      settings.githubToken = decrypt(settings.githubToken ?? '')
      settings.routerAudioKey = decrypt(settings.routerAudioKey ?? '')
      return {
        settings,
        history: Array.isArray(raw.history) ? raw.history : []
      }
    } catch {
      if (existsSync(filePath())) copyFileSync(filePath(), `${filePath()}.unreadable-${Date.now()}`)
      return { settings: normalizeSettings(), history: [] }
    }
  }

  private write(): void {
    const payload: Persisted = {
      settings: {
        ...this.data.settings,
        apiKey: encrypt(this.data.settings.apiKey),
        githubToken: encrypt(this.data.settings.githubToken),
        routerAudioKey: encrypt(this.data.settings.routerAudioKey)
      },
      history: this.data.history
    }
    atomicJson(filePath(), payload)
  }
}
