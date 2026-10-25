export const APP_NAME = 'S2Teasy'
export const APP_ID = 'com.s2teasy.app'
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_MODEL = 'google/gemini-2.5-flash'
export const DEFAULT_HOTKEY = 'Control+Shift+Space'
export const HISTORY_LIMIT = 400
export const SAMPLE_RATE = 16_000
export const WAVEFORM_BARS = 28
export const PCM_FRAME_SAMPLES = 4_000
export const ROUTER_AUDIO_LISTEN = 'wss://api.router.audio/v1/listen'
export const UPDATE_OWNER = 'HighRyzchs'
export const UPDATE_REPO = 'S2TEasy'
export const UPDATE_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo&description=S2Teasy%20updates'

export const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Detect automatically' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' }
]

/** S2Teasy Cloud (hosted credits). Settings can point at a test server instead. */
export const DEFAULT_CLOUD_URL = 'https://s2teasy-cloud.roshsah63.workers.dev'
export const cloudUrlOf = (configured: string) => configured.trim() || DEFAULT_CLOUD_URL
