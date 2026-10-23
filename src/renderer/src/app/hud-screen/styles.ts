import type { HudStyle } from '@shared/hud'

export const STYLE_INFO: Record<HudStyle, string> = {
  island: 'A pill that grows into an editor when you click your words. The quiet default.',
  caption: 'Your words as subtitles. Click them to edit, with the controls underneath.',
  edge: 'A light line along the bottom of the screen that pulses with your voice. Click the words above it and a sheet rises with your draft.',
  cyber: 'A notched black panel with red linework, a yellow tab and cyan highlights. Fixed words glitch in.',
  pixel: 'A handheld-RPG text box. Words type in letter by letter, cues are type badges and the finish timer is an HP bar.',
  ghost: 'No floating window. Your words appear greyed out where you type, and the editor drops down under the text box.',
  balloon: 'A comic panel with a caption box, sound-effect cues and action lines when you get excited.'
}

export const ACCENTS = [
  { value: '#a5e6ce', name: 'Mint' },
  { value: '#00f0ff', name: 'Cyan' },
  { value: '#ff003c', name: 'Red' },
  { value: '#fcee0a', name: 'Yellow' },
  { value: '#b9a2ff', name: 'Violet' }
] as const

export type PreviewState = 'talking' | 'editing' | 'paused'

export const PREVIEW_STATES: { id: PreviewState; label: string }[] = [
  { id: 'talking', label: 'Talking' },
  { id: 'editing', label: 'Editing' },
  { id: 'paused', label: 'Paused' }
]
