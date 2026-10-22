# Windows release smoke test

Run against the packaged x64 build as well as Electron development mode. Use disposable text and your own provider account. Do not publish recordings or keys in test evidence.

- Configure each supported engine and verify the selected model actually accepts audio. Test authentication failure and an unknown slug.
- Dictate at least two minutes continuously into Notepad. Confirm phrases arrive in order, stop drains outstanding requests, and History matches the inserted finalized text. Repeat with insertion on stop.
- Disconnect the network during a recording. Confirm the error remains visible, finalized text stays in History, retained audio can be exported, and recovery via a configured batch/local engine does not paste automatically.
- Terminate the process during recording and reopen. Verify the interrupted session, preserved text, and audio recovery. Repeat with audio recovery disabled; only finalized text should be available.
- Toggle and hold shortcuts, release during connection/microphone initialization, cancel during a pending request, and start a new session immediately after failure. Late old results must not insert.
- Test Qwen ASR and Grok STT with Auto and Transcription, and an audio chat model with Auto and Chat. Verify HTTP errors include model, route, and status.
- Use the HUD Stop button. Clicking the waveform/body should not stop recording. Verify the HUD appears above regular applications without stealing focus, on the pointer's display, at all nine placements. Test vertical/compact layouts at 80%, 100%, and 140% size; controls must remain clickable. Test display reconnect and Windows scaling. Exclusive fullscreen, the secure desktop, and elevated targets need separate checks and may impose OS restrictions.
- Switch target apps and close the original target before paste. An insertion failure must leave a recoverable transcript. Test an app that refuses synthetic paste and record the result honestly.
- Correct a History transcript, add/disable/remove vocabulary rules, test names in punctuation and longer words, and check that original recognition text remains available in exported labels.
- With successful-take retention off, confirm successful audio removal. With it on, export WAV + JSON and check audio duration and intended text. Delete a session, clear History, and verify files are removed. Test retention at startup and during an idle running session.
- Verify Windows DPAPI key storage and no plaintext fallback. Try a corrupt settings file in a disposable profile; check preservation and recovery of session journals.
- Build portable and NSIS artifacts. Check install/uninstall, tray behavior, shortcut conflicts, and updates. Automatic installation must reject an artifact with a missing/mismatched digest. Sign and independently inspect binaries before a public release.

Linux unit/browser tests do not substitute for these checks.

- While finishing, click Cancel and press the shortcut again. The HUD must hide immediately, the microphone must release, and late responses must not paste or resurrect it.
- Deny permission, disconnect the microphone, use a bad key, and disconnect the network. Dismiss each error; also wait eight seconds to verify automatic hiding while History retains recovery details. Cancel while permission/setup is pending, then start again.
- Watch waveform height while speaking quietly, loudly, and pausing; confirm the clock advances. A running clock alone does not prove audio capture.
- Check all six skins and upload/remove a local emblem and background; restart and verify persistence. Inspect the mint waveform icon in Explorer, taskbar, tray, installer, and uninstall entry from the newly built executable.

## 1.5.0 update and review checks

1. Portable 1.4.0: manually open the published 1.4.1 baseline at the path you will keep. Installed 1.4.0 can update directly. Disable auto-update for a deliberate test, then Check → Download → Restart into 1.5.0. Check the visible version, persisted settings/history, and `update-result.json` in the user-data folder. For portable, verify the original launcher changed and a `.previous` rollback copy exists. Do not count changing the UI version alone as an update test.
2. Dictate a short last word and press Stop immediately. Repeat with tail 0, 600 and 1500 ms, quiet speech, and a two-minute take. Compare the final word and duration in History. Cancel during the tail must release the mic immediately and prevent late paste. Confirm a hung flush becomes a recoverable error.
3. Click HUD Copy while no text field is focused. Paste into Notepad and verify the whole available transcript. Click Review during recording/processing; it must finish into the editor without typing late words into it. Copy corrected text explicitly.
4. Save a `rosin → Roshan` correction. Remember it in Vocabulary, then test a new take. Practise this should prefill Roshan. Keep audio for training, enable optional word timings with a compatible STT model, record, and inspect word highlighting/seek. Save a labeled word clip and verify its actual audio and intended text in Voice practice. An old untimed recording must show ordinary playback without fabricated timing.
5. Check usage for a successful paid call, unknown-cost response, failed call, retry, recovery call and local call. Compare reported costs with provider billing, allowing for missing metadata. CSV should contain no transcript, recording or key. Deleting History must not silently erase metrics.
6. Set anchors/offsets on multiple displays and Windows scaling. Check Copy/Review/Stop/Cancel are reachable in all skins, vertical/compact layouts and size ranges. Download/import a theme and edit the SVG design source in an external editor, export PNG, then upload it. Restart and check persistence.
