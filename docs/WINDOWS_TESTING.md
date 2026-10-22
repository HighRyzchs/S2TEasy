# Windows release smoke test

Run against the packaged x64 build as well as Electron development mode. Use disposable text and your own provider account. Do not publish recordings or keys in test evidence.

- Configure each supported engine and verify the selected model actually accepts audio. Test authentication failure and an unknown slug.
- Dictate at least two minutes continuously into Notepad. Confirm phrases arrive in order, stop drains outstanding requests, and History matches the inserted finalized text. Repeat with insertion on stop.
- Disconnect the network during a recording. Confirm the error remains visible, finalized text stays in History, retained audio can be exported, and recovery via a configured batch/local engine does not paste automatically.
- Terminate the process during recording and reopen. Verify the interrupted session, preserved text, and audio recovery. Repeat with audio recovery disabled; only finalized text should be available.
- Toggle and hold shortcuts, release during connection/microphone initialization, cancel during a pending request, and start a new session immediately after failure. Late old results must not insert.
- Use the HUD Stop button. Clicking the waveform/body should not stop recording. Verify the HUD appears above regular applications without stealing focus, on the pointer's display, at both positions. Test display reconnect and Windows scaling. Exclusive fullscreen, the secure desktop, and elevated targets need separate checks and may impose OS restrictions.
- Switch target apps and close the original target before paste. An insertion failure must leave a recoverable transcript. Test an app that refuses synthetic paste and record the result honestly.
- Correct a History transcript, add/disable/remove vocabulary rules, test names in punctuation and longer words, and check that original recognition text remains available in exported labels.
- With successful-take retention off, confirm successful audio removal. With it on, export WAV + JSON and check audio duration and intended text. Delete a session, clear History, and verify files are removed. Test retention at startup and during an idle running session.
- Verify Windows DPAPI key storage and no plaintext fallback. Try a corrupt settings file in a disposable profile; check preservation and recovery of session journals.
- Build portable and NSIS artifacts. Check install/uninstall, tray behavior, shortcut conflicts, and updates. Automatic installation must reject an artifact with a missing/mismatched digest. Sign and independently inspect binaries before a public release.

Linux unit/browser tests do not substitute for these checks.
