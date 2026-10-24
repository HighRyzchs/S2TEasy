import { defaultSettings } from '@shared/types'
import type { HudApi } from './types'

/** A HUD api that does nothing, for frozen thumbnails that never touch the main process. */
export const inertApi: HudApi = {
  hudEdit: async () => 'typed',
  hudPause: async () => undefined,
  hudFinish: async () => undefined,
  hudHold: () => undefined,
  hudCues: async () => undefined,
  hudFocus: async () => undefined,
  hudPointer: () => undefined,
  hudArea: () => undefined,
  learnWord: async () => defaultSettings(),
  copyHistory: async () => true,
  cancelRecording: async () => undefined
}
