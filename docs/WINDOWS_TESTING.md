# Windows release smoke test

## 1.7.2 update handoff

Windows CI now runs `scripts/windows-update-smoke.mjs` only on disposable GitHub Actions runners. It installs real published 1.5.1 and the new NSIS package, verifies the original target's ProductVersion in a path containing shell-sensitive characters, and tests rejection of a zero-exit no-op installer. It exercises native helper acknowledgment and installer execution, not the user's desktop UI or the old 1.5.1 launcher's handoff.

On a real desktop, test blocked/missing PowerShell, helper early exit, failed acknowledgment, installer error, mismatched target version, duplicate Restart clicks, persisted diagnostics, original data, and the direct-installer fallback. Startup failures must keep the app open; an interrupted receipt must pause automatic downloads. First recover a broken older updater by running the installer file directly. Never test a forced power interruption on valuable user data.

## 1.7.0 speech cues

Follow [the cue walkthrough](CONCEPTS.md#try-emotion-and-delivery-analysis) with a short retained practice take and your own OpenRouter account. Verify emotion/delivery category controls, allowed labels, clear-only filtering and speaking-style guidance. Analyze the same words spoken neutrally, playfully and with emphasis; record inaccurate results and abstentions instead of assuming model quality.

Check the selected excerpt and estimated timestamps, relabel a cue, revert to the model suggestion, dismiss/restore a cue, and reopen Review to confirm persistence. Copy expressive/structured context; ensure the spoken text is unchanged, user labels have `source: user`, and dismissed cues are absent. Delete analysis without deleting words. Verify separate Speech cues filtering in Usage & spend.

Test invalid/text-only/STT-only slugs, bad key, exhausted credits, unsupported schema/provider route, silence, expired audio, ranges beyond the recording, network failure, Cancel and closing Review during a request. Failed/retried-by-user calls must not clear a previous good analysis, duplicate paid requests, resurrect deleted History or insert into another app. Cancellation may still incur provider charges. Cue analysis must stay off after upgrading an existing profile until explicitly enabled.

## General regression checks

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

1. Portable 1.4.0: manually open the published 1.4.1 baseline at the path you will keep. For an installed 1.4.0 app with a stalled FINDSTR loop, use the manual recovery in UPDATE_TROUBLESHOOTING.md first. Disable auto-update for a deliberate test, then Check → Download → Restart into 1.5.0. Check the visible version, persisted settings/history, and `update-result.json` in the user-data folder. For portable, verify the original launcher changed and a `.previous` rollback copy exists. Do not count changing the UI version alone as an update test.
2. Dictate a short last word and press Stop immediately. Repeat with tail 0, 600 and 1500 ms, quiet speech, and a two-minute take. Compare the final word and duration in History. Cancel during the tail must release the mic immediately and prevent late paste. Confirm a hung flush becomes a recoverable error.
3. Click HUD Copy while no text field is focused. Paste into Notepad and verify the whole available transcript. Click Review during recording/processing; it must finish into the editor without typing late words into it. Copy corrected text explicitly.
4. Save a `rosin → Roshan` correction. Remember it in Your voice, then test a new take. Practise this should prefill Roshan. Keep audio for training, enable optional word timings with a compatible STT model, record, and inspect word highlighting/seek. Save a labeled word clip and verify its actual audio and intended text in Your voice. An old untimed recording must show ordinary playback without fabricated timing.
5. Check usage for a successful paid call, unknown-cost response, failed call, retry, recovery call and local call. Compare reported costs with provider billing, allowing for missing metadata. CSV should contain no transcript, recording or key. Deleting History must not silently erase metrics.
6. Set anchors/offsets on multiple displays and Windows scaling. Check Copy/Review/Stop/Cancel are reachable in all skins, vertical/compact layouts and size ranges. Download/import a theme and edit the SVG design source in an external editor, export PNG, then upload it. Restart and check persistence.

## 1.5.1 updater regression

- Rapidly click Restart and trigger the tray update action. Only one hidden PowerShell helper should launch. The Settings and tray update actions must be disabled while applying; the new helper must never run FINDSTR/TASKLIST or a CMD polling loop.
- Make helper launch fail in a disposable environment. Confirm the app remains open and reports the error. Restart before download verification must not queue a future automatic installation.
- If reproducing the old 1.4.0 loop in a disposable VM, quit the app and stop only the matching legacy helper process tree using UPDATE_TROUBLESHOOTING.md. Do not treat installing a newer version as proof that an old orphaned helper was terminated.

## 1.6.0 welcome and profile

- Upgrade an existing profile and confirm History, credentials, engine, recovery and training settings remain intact. The optional tour appears until completed; complete it, restart, and verify it does not repeat automatically.
- Enter a nickname or skip the name. Try Unicode, an emoji, long text, and a cleared name. Verify the workspace greeting and placeholders reflect the saved choice; no name is automatically added to Vocabulary or provider requests.
- Replay the tour from Profile & tour, change the look/recovery toggle, save and exit at each step, and use Escape. In a disposable profile with failed writes, verify retry preserves input and Continue without saving exits for the current session.
- Use the Overview checklist links to reach Speech engine and Dictation settings. Hide and restore the checklist. A local volume test must release the microphone when stopped or when leaving Settings; the welcome tour itself must not request microphone permission.
- Check dialog focus trapping, Tab/Shift+Tab, heading focus after each step, reduced motion, light/dark/system appearances, Windows scaling, and small windows.

## Your voice studio and handoff (1.8.1)

- Your voice is first in the sidebar and opens by default; the welcome tour returns here when engine setup is not selected.
- Check Paper and Night views, side-by-side output/recorder on wide windows, and stacking on smaller windows. Existing appearance preferences remain respected.
- Add/edit a word in its popup, verify saving closes it, failed saving preserves input, and Escape closes with focus restored.
- Record a labeled take with explicit audio consent. The meter uses incoming audio; Finish disables during processing and Cancel stays available. Select, play and review the take from the library.
- Run the actual Electron handoff check as well as the NSIS upgrade smoke. An acknowledged script-only test does not establish that the helper survives app.quit(). The packaged GUI bridge is required in installed and portable builds.
- After manual recovery, verify the running version is recognized and the earlier failed receipt remains available as history, without claiming its automatic attempt succeeded.
