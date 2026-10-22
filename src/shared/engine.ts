import type { AppSettings } from './types'
import { resolveStreamingKey } from './types'

export function startError(settings: AppSettings): string | null {
  if (settings.sttEngine === 'local') {
    try {
      const url = new URL(settings.localEndpoint)
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        return 'Local speech must use a loopback HTTP endpoint, such as http://127.0.0.1:8000/v1/audio/transcriptions.'
      }
    } catch {
      return 'Enter a valid local transcription endpoint.'
    }
    return settings.localModel.trim()
      ? null
      : 'Choose the model installed on your local speech server.'
  }
  if (settings.sttEngine === 'router-audio') {
    if (!resolveStreamingKey(settings)) {
      return 'Add a router.audio or streaming provider key in Settings, or switch to OpenRouter batch.'
    }
    return null
  }
  if (!settings.apiKey.trim()) return 'Add your OpenRouter API key in Settings.'
  if (!settings.model.trim()) return 'Choose a transcription model slug.'
  return null
}
