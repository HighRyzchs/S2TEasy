/** The slice of the preload API the HUD uses. The browser preview passes its own. */
export type HudApi = Pick<
  Window['s2t'],
  | 'hudEdit'
  | 'hudPause'
  | 'hudFinish'
  | 'hudHold'
  | 'hudCues'
  | 'hudFocus'
  | 'hudPointer'
  | 'hudArea'
  | 'learnWord'
  | 'copyHistory'
  | 'cancelRecording'
>

/** What a pending "Remember this fix?" pill is about. */
export type Fix = {
  /** Where the new text starts in the session text. */
  start: number
  length: number
  from: string
  to: string
  clip: boolean
}
