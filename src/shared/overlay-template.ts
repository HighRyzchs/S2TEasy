import { normalizeOverlayTheme, type OverlayTheme } from './overlay-theme'
export function overlayTemplate(theme: OverlayTheme): string {
  return JSON.stringify(
    { format: 's2teasy-overlay', version: 1, theme: normalizeOverlayTheme(theme) },
    null,
    2
  )
}
export function readOverlayTemplate(text: string): OverlayTheme {
  if (text.length > 2_100_000) throw new Error('Theme file is too large (maximum 2 MB).')
  const value = JSON.parse(text)
  if (
    value?.format !== 's2teasy-overlay' ||
    value.version !== 1 ||
    !value.theme ||
    typeof value.theme !== 'object' ||
    Array.isArray(value.theme)
  )
    throw new Error('Choose an S2Teasy overlay template, version 1.')
  return normalizeOverlayTheme(value.theme)
}
export const MIC_TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><!-- Keep the transparent canvas. Edit shapes and export PNG or WebP. --><g fill="none" stroke="#b2e9cf" stroke-width="28" stroke-linecap="round"><rect x="190" y="60" width="132" height="250" rx="66"/><path d="M132 236v20a124 124 0 0 0 248 0v-20M256 380v72m-66 0h132"/></g></svg>`
export const TEMPLATE_GUIDE = `S2Teasy overlay kit (MIT)\n\n1. Edit microphone.svg in an image/vector editor. Keep its 512 × 512 transparent canvas. Export as PNG or WebP, then upload it in HUD studio. SVG is a design source, not an app upload format. Raster assets are resized to 512 pixels; do not include private information in a shared theme.\n2. Open overlay.json in a text editor or import it using HUD studio. Share a style by exporting your theme. No API keys or settings outside the overlay are included.\n3. font: outfit, system, mono, serif. wave: ribbon, filaments, columns, needles, mirror. skin: minimal, frost, glass, cyberpunk, pixel, studio. orientation: horizontal or vertical. scale: 0.8–1.4; sensitivity: 0.5–3. Colors use HSL fields. The waveform responds to speech volume; this kit does not contain executable animation code.\n4. Use the live preview and microphone test, then save. HUD position is separate, under Settings → Appearance.\n\nOnly bounded PNG/JPEG/WebP data URLs are embedded. Remote URLs, custom scripts, CSS and SVG markup are not executed.\n`
