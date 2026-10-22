# Development validation

Validated in the Linux cloud environment using Node.js 24.19.0, npm 11.9.0, Electron 35.7.5, and Chromium. CI is configured for Node 22 LTS. These results apply to this prepared instance, not an independently restored task or a Windows release.

- Frozen installation (`npm ci`) completed twice with Electron proxy support and normal TLS/package verification. The supplied lockfile is unchanged.
- Unit tests: 93 tests across 22 files passed. Provider responses and native insertion are mocked in controller tests. The resampling test checks two minutes of sample timing, not a real two-minute voice recording.
- TypeScript checks for main/preload/shared and renderer passed.
- Production main, preload, and renderer bundles compiled successfully using `npm exec -- electron-vite build`.
- Browser checks exercised rule creation/toggling, light appearance, History correction/search, delete cancellation, practice consent, and refusal to record in browser-only preview. No page JavaScript errors occurred.
- Overview, History, Vocabulary, Voice practice, and Settings were checked at 1280, 820, and 390 pixels wide; no horizontal page overflow was observed. The website was checked at 1440, 820, and 390 pixels wide.
- The Electron binary version check succeeded. Its Linux DBus warning does not establish a running desktop session; no native desktop smoke test was performed.

## Pending validation

- Paid/live OpenRouter and router.audio requests; no provider key was configured. API shape tests are mocked and do not establish model availability or recognition accuracy.
- A local speech server/model; the loopback adapter was tested with mocked multipart responses, not an installed acoustic model.
- Windows microphone capture, continuous multi-minute speech, global shortcuts, native target focus/paste, overlay z-order, installer packaging, and executable signing. Follow WINDOWS_TESTING.md.
- Acoustic personalization/fine-tuning and held-out accuracy evaluation. Vocabulary rules, prompt hints for batch engines, labeled practice takes, and audio/text export are implemented; model adaptation is not.
- GitHub push, website deployment, release publication, cloud snapshot publication, and fresh-task restoration. None were performed.

## Environment draft

Saved installation and startup instructions, the actual `S2TEasy` mount path for `HighRyzchs/S2TEasy`, and custom domain additions `openrouter.ai`, `router.audio`, `api.router.audio`, and `api.github.com`. Existing package-manager presets were preserved. The source is imported into an unborn, uncommitted Git checkout. The original uploaded archive remains available. Review and save the draft in environment settings, then publish the environment to retain a snapshot. A saved draft does not apply network changes or publish code.
