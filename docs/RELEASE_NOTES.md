## Development update-test target — v1.5.0

A real target for testing in-app updates from 1.4.1. These are unsigned development builds; native Windows microphone, focus, and update execution require desktop testing.

- Add Usage & spend: daily charts, 7/30/90-day views, model breakdowns, audio/request counts and CSV export. Only provider-reported costs are counted; missing data is marked unknown. Metrics stay local and separate from transcripts.
- Capture a configurable 0–1500 ms after Stop (600 ms default), flush the worklet, retain short final speech, and preserve unfinalized stream words for review. Cancel remains immediate.
- Add Copy and Review controls to the recording HUD. Review finishes recording and prevents queued speech from being inserted into the editor.
- Add a shared transcript review editor, opt-in Vocabulary suggestions, and a prefilled Voice practice action.
- Play retained audio locally. Genuine provider word timings support highlighting, seeking and explicitly saving a labeled word clip. Optional timing requests default off for compatibility; old untimed audio still plays normally.
- Add custom HUD offsets and an anchor picker, font choices, waveform styles, downloadable theme/microphone design templates, and theme import/export.
- Retain the repaired portable updater: original launcher replacement, SHA-256 verification, rollback copy, and restart result receipt.

**Portable 1.4.0:** download and open the [1.4.1 baseline](https://github.com/HighRyzchs/S2TEasy/releases/tag/v1.4.1) once manually. Then Check for updates → download 1.5.0 → restart. The old 1.4.0 updater replaces a temporary extracted EXE and cannot provide a reliable persistent portable update test.

**Installed 1.4.0 or 1.4.1:** Check for updates → download → restart. Confirm 1.5.0 and your existing settings/history. Report the packaging type and any update error when testing.

Word examples do not automatically train a speech model. No hosted payment service or corporate API key is included.
