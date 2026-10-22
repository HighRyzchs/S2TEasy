# Development validation

Validated in the Linux cloud environment using Node.js 24.19.0, npm 11.9.0, Electron 35.7.5, and Chromium. CI is configured for Node 22 LTS. These results apply to this prepared instance, not an independently restored task or a Windows release.

- Frozen installation (`npm ci`) completed twice with Electron proxy support and normal TLS/package verification. Dependency versions and integrity entries remain unchanged. The lockfile root version was subsequently synchronized to the package version 1.5.0 for publication; this does not change dependencies.
- Unit tests: 143 tests across 34 files passed. Provider responses and native insertion are mocked in controller tests. The resampling test checks two minutes of sample timing, not a real two-minute voice recording.
- TypeScript checks for main/preload/shared and renderer passed.
- Production main, preload, and renderer bundles compiled successfully using `npm exec -- electron-vite build`.
- Browser checks exercised rule creation/toggling, light appearance, History correction/search, delete cancellation, practice consent, and refusal to record in browser-only preview. No page JavaScript errors occurred.
- Overview, History, Vocabulary, Voice practice, and Settings were checked at 1280, 820, and 390 pixels wide; no horizontal page overflow was observed. The website was checked at 1440, 820, and 390 pixels wide.
- The Electron binary version check succeeded. Its Linux DBus warning does not establish a running desktop session; no native desktop smoke test was performed.

## Pending validation

- Paid/live OpenRouter and router.audio requests; no provider key was configured. An unauthenticated live catalogue read confirms Qwen ASR and Grok STT advertise transcription output. Paid transcription itself remains unverified; request/response tests are mocked and do not establish recognition accuracy.
- A local speech server/model; the loopback adapter was tested with mocked multipart responses, not an installed acoustic model.
- Windows microphone capture, continuous multi-minute speech, global shortcuts, native target focus/paste, overlay z-order, installer execution/upgrade behavior, and executable signing. Follow WINDOWS_TESTING.md.
- Acoustic personalization/fine-tuning and held-out accuracy evaluation. Vocabulary rules, prompt hints for batch engines, labeled practice takes, and audio/text export are implemented; model adaptation is not.
- Stable Windows validation, cloud snapshot publication, and fresh-task restoration have not been performed. The explicitly labeled development update-test release 1.4.1 was published; 1.5.0 is its target. GitHub source publication and the Pages deployment are complete; see the publication status below.

## Environment draft

Saved installation and startup instructions, the actual `S2TEasy` mount path for `HighRyzchs/S2TEasy`, and custom domain additions `openrouter.ai`, `router.audio`, `api.router.audio`, and `api.github.com`. Existing package-manager presets were preserved. The source was imported from the original archive, committed, and pushed to the public repository. The original uploaded archive remains available. Review and save the draft in environment settings, then publish the environment to retain a snapshot. A saved draft does not apply network changes or publish code.

## GitHub publication

- Source, README with screenshot, community files, and website were pushed to `HighRyzchs/S2TEasy` on `main`.
- GitHub reports 100% community profile health, with the README, contribution guide, code of conduct, license, and pull request template detected.
- The Node 22 CI test and type-check job passed on GitHub Actions. The Windows packaging job also passed and uploaded the **S2Teasy-windows** development artifact: https://github.com/HighRyzchs/S2TEasy/actions/runs/39778293434. This verifies packaging, not Windows microphone or insertion behavior.
- The repository owner enabled Pages with GitHub Actions. The initial deployment before that setting failed; the retried deployment succeeded: https://github.com/HighRyzchs/S2TEasy/actions/runs/39778628972.
- GitHub Pages URL: https://highryzchs.github.io/S2TEasy/. The cloud execution proxy denied direct HTTP access to that hostname; deployment success was verified using the GitHub Actions and Pages APIs, not by an external browser request. Local website assets and responsive layout checks passed.
- Attempts to edit repository About metadata and enable private vulnerability reporting returned GitHub integration permission errors. Those owner settings remain unchanged; code push and Actions permissions work.

## HUD and updater revision

- Ink/Frost pills, accent selection, compact mode, and optional recent transcript text replace the original default neon HUD. The Studio mixer remains opt-in. Windows overlay sizing follows the chosen layout, while the always-on-top/focus behavior still needs desktop verification.
- The actual HUD component and theme editor are rendered in the built, standalone interactive preview. It starts with simulated speech and provides opt-in local microphone metering. Preview updates are simulated.
- Update UI covers availability, downloading/progress, and user-triggered restart. Eight updater tests cover discovery, explicit downloading, digest verification, corrupt/missing artifacts, and incompatible releases. No provider or payment credentials are needed for these tests.
- The earlier feed initially had no release. A real 1.4.1 development baseline now exists with both Windows EXEs and GitHub SHA-256 metadata; 1.5.0 is the update-test target. End-to-end installation/replacement on Windows is still pending. A demo update is separate from a published release.

## Liquid Glass, lifecycle and audio routing revision (1.4.0)

- Added Liquid Glass, Cyberpunk and 8-bit alongside Ink, Frost and Studio; vertical layout, nine screen placements, 80–140% size, wave sensitivity, and local raster emblem/background uploads.
- Browser checks exercised all six skins’ Stop → Finishing → Cancel flow and recording cancellation/replay. Clock and waveform change over time. Scaled vertical controls fit within the HUD. Local image import/background/removal and rejection of SVG were checked.
- A browser Web Audio check feeds a synthetic signal through the actual volume meter. Silence settles to 3 px bars, and a louder signal raises them to approximately 24 px. The meter uses a muted output graph to keep processing active without audio feedback. This is not a hardware microphone test. End preview releases the stream; permission-error dismissal works.
- Lifecycle tests cover cancelling a pending microphone permission result, starting another session before old setup resolves, rejecting late events/responses, aborting HTTP transcription, and retaining recovery audio after timed error hiding. Audio capture explicitly resumes its context; errors auto-hide after eight seconds.
- Official OpenRouter OpenAPI and TypeScript SDK confirm distinct STT and chat contracts. The model request now includes transcription output; auto routing selects `/audio/transcriptions` for the two reported ASR slugs and `/chat/completions` for audio chat models. The explicit API-operation selector bypasses discovery for new slugs. Unsupported optional provider features are omitted.
- Build-time icon generation now matches the mint waveform logo, with seven Windows ICO sizes from 16 to 256 px. A version bump and new EXE are required; an older downloaded EXE is not changed by a source/website update.
- Native Windows interactions, real microphone capture, paid-provider accuracy, and desktop glass composition still require the Windows smoke test.

## Review, usage and capture-tail revision (1.5.0)

- New tests cover the capture tail/worklet acknowledgement, immediate cancellation, short final VAD speech, unconfirmed streaming words/audio, Review suppressing queued paste, clipboard-copy preservation, correction alignment, genuine timed word slicing, byte-range playback, safe theme imports, real/unknown costs and retries, usage persistence and CSV escaping, display offsets, and updater receipt reporting.
- Typechecking, desktop production bundles, and site production build passed. Browser checks exercised correction suggestions → Vocabulary → prefilled practice, custom offsets, font selection, theme download/import, and a 600-pixel viewport. No JavaScript errors or horizontal page overflow were observed. All six skins were inspected in horizontal/vertical previews at 140% scale. An additional browser check used the native HUD viewport dimensions for 36 skin/orientation/scale combinations (80%, 100%, 140%); all control bounds stayed inside the viewport. This is a layout check, not a native Windows z-order or input test.
- Screenshots show sample transcripts and simulated spend, not actual billing. Paid speech/model timing support remains unverified without a provider account. Word timing is opt-in; no forced alignment or acoustic fine-tuning is claimed.
- The 1.4.1 release Windows workflow succeeded, including native PowerShell parsing of portable/installed helper scripts. Linux tests never executed a Windows update or asserted that the microphone/focus behavior passed on a real desktop.
