# Overlay design kit

This folder is a **standalone** mock of the S2Teasy recording HUD. You do not need Electron, npm, or a new `.exe` to try looks.

## Open it

1. Download this folder (or clone the repo).
2. Open [`index.html`](./index.html) in Chrome, Edge, or any CSS playground that can load a local HTML + CSS pair.
3. Edit [`overlay-theme.css`](./overlay-theme.css) and refresh.

The page shows four states on a 520×80 frame — the same size as the real Windows overlay window.

For cyberpunk mixing, open [`mixer.html`](./mixer.html) — circle, waveform, and bezel are separate, each with a color slider. Signal Ribbon is a bezel option (light bar, no chrome).

## What you can change

| You edit | File |
| --- | --- |
| Colors, radius, glow, type, spacing | `:root` tokens at the top of `overlay-theme.css` |
| Layout / decorations | The rest of `overlay-theme.css` |
| Extra ornaments | Optional extra nodes are fine **if** you keep the required class names |

Leave these class names in place so the app can drop your CSS in:

`stage` · `hud` · `core` · `halo` · `ring` · `pulse` · `spectrum` · `meta` · `row` · `chip` · `clock` · `partial` · `abort`

`data-status` on `.stage` is one of: `listening` · `transcribing` · `inserting` · `success` · `error` · `arm-paste` · `hidden`

## Hard limits (the Windows window)

- Content box: **520 × 80** CSS pixels (window is 520 × 96 with a little padding).
- Page / stage background must stay **transparent** in the real app. The dark desk in `index.html` is preview-only.
- **Stop** (`.abort`) must stay a real `<button>` — clicks have to hit it.
- Glow must stay **tight to the HUD**. A huge bloom gets clipped by the tiny window and looks worse than no glow.
- No network assets in the shipped theme if you can help it (local CSS only). Google Fonts in this preview is OK; the app already bundles Outfit.

## Format to send back

Send **one** of these, in this order of preference:

1. **Your edited `overlay-theme.css`** (best). Open a PR, or drop the file in chat.
2. The same CSS pasted into a gist / CodePen, plus a note if you changed HTML.
3. A screenshot of each state **and** the CSS. Screenshot-only means we have to guess.

Do **not** send a compiled Electron build, a `.exe`, or a Figma file with no CSS.

If you add HTML, include a copy of `index.html` with your extra nodes. Required structure:

```html
<div class="stage" data-status="listening">
  <div class="hud">
    <div class="core">…</div>
    <div class="spectrum"><i style="height: …"></i> × 28</div>
    <div class="meta">
      <div class="row">
        <span class="chip">Listening</span>
        <span class="clock">0:04</span>
      </div>
      <div class="partial">…</div>
    </div>
    <button type="button" class="abort">Stop</button>
  </div>
</div>
```

Spectrum bar heights are set inline (`height: 4–30px`). Style `.spectrum i`; do not depend on a fixed height in CSS if you want them to move with the mic.

## What the app owns (leave it)

- Microphone → 28 smoothed bands
- Live partial text and elapsed time
- Stop / hotkey wiring
- Showing / hiding the window

You own how it looks. We own how it talks to Windows.
