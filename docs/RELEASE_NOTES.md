## Voice memory, speech tidy and voice commands — v1.10.0

Everything from the 1.10 betas, now as a full release. Installing over v1.9.x or a beta keeps your settings and History.

**Fixed in this release:** OpenRouter Whisper-style models (for example Whisper served by Groq) failed every take since beta 8. S2Teasy sent your personal words and mixed-language note as Whisper's prompt, and Groq rejects a prompt over 224 tokens. Dedicated OpenRouter speech models now get the same request as in v1.9 again. Chat-style audio models still get the written note.

**Voice memory (beta feature, off by default).** Fix a few misheard words on the HUD and S2Teasy keeps the *sound* of what you said with the words you meant, then underlines or fixes them the next time it hears that sound. Everything stays on your PC. Turn it on in Your voice → Voice memory.

**Speech tidy** (Your voice → Structure). Takes stutters, fillers (um, uh), corrections ("the store, I mean the mall") and pause breaks out of dictation without rewording you. Your own habit words ("yeah", "like", "you know") go only where they fill a gap. Mixed languages (Tagalog, Arabic, Hindi/Urdu): their doubles are never taken for stutters, and Arabic and Hindi words can be written in English letters or their own script.

**Voice commands for structure.** Say "new paragraph", "new line", "bullet point" or "next number" on its own between sentences and it shapes the text. Add your own phrases in Your voice → Structure.

**Your last word is kept.** A soft last word the engine drops is kept from the live preview, and live engines get half a second of silence before finishing so they commit it.

**The HUD's clicks, rebuilt.** The HUD window's own shape is now the HUD, so Windows sends clicks, taps and pen presses on it to the HUD and everywhere else to the app underneath. Editing words while you talk, dragging across words, Done, Pause and Copy work in every style, and the keyboard goes back to the app you dictate into after an edit.

**The app window fits half a laptop screen,** with an icon rail in narrow windows, proper switches and consistent dropdowns.

---

## Your words, fixed before they land — v1.9.0

**Recognition**
- Personal words now remember every way they get misheard, including multi-word ones ("as two teasy" → S2Teasy), with a kind (name, how I say it, keyword, phrase), an optional sounds-like note, kept clips and fix counts. Older vocabulary rules load unchanged.
- Live typing tracks exactly what it typed. Trailing words that could still become a learned phrase wait for the next phrase, so a name is never typed half-fixed. Words learned mid-session apply to everything not yet typed.
- Names and keywords go to OpenRouter audio chat models and local servers as recognition hints (dedicated OpenRouter ASR requests still omit them). Passing them to Deepgram through router.audio (`keyterm`) is opt-in and marked experimental, because router.audio does not document it.
- Accent check in Practice: read six short sentences once; each word the engine turns into another word can be saved as an accent fix.
- Opt-in context check for accent fixes: after a session that swapped such a word, a small OpenRouter text model sees each swap as two choices and puts back what you said where the fix does not fit the sentence. It can only choose between the two words.

**Speech cues**
- Cues are heard per phrase while you talk and appear on the HUD in front of the phrase; the whole session is analyzed, not only its first 30 seconds.
- Per-app rules (Your voice → Expression): cues on in chat, off in email, for example.
- A monthly limit on the Usage page pauses paid extras (cues, context checks) once reached; dictation itself never stops.

**The HUD**
- One HUD instead of two. The shortcut starts, pauses and resumes; a paused session finishes by itself after a delay you choose (7 seconds by default) that holds while you hover or edit; Done finishes at once.
- Click your words to edit them while you keep talking, or drag across several to fix a phrase. A one-line pill asks whether to remember the fix as a name or as how you say it.
- Already-typed text is replaced in place only when nothing else touched the app since S2Teasy typed it (no key or click outside the HUD, at most 400 characters back). Otherwise the fix is saved in History and the app's text is left alone.
- Copy, a per-session speech-cue switch, a proper exit animation, and a click-through window. Seven styles: Island, Caption, Edge glow, Cyberpunk, 8-bit, Ghost text and Speech balloon, each recolorable.
- "Show it on my screen" on the HUD page plays a short demo on the real overlay without recording anything.

**The app**
- A redesigned app: Home, Your voice (Words, Practice, Expression), History (with app icons, what changed, audio playback), Usage (a full local analytics page), HUD and Settings, in dark and light.
- Sessions remember which program they typed into (never the window title) to show its icon.

**Not yet verified on Windows:** live cues and the context check against paid models, pausing and resuming with each engine, focus handoff between the HUD and the app while editing, in-place replacement of typed text, app icons and the click-through window. These are covered by unit tests against the same logic but need the native smoke test before a stable release.

---

## Give cold Windows launches time to acknowledge — v1.8.2

- Increase the verified helper-startup window from 10 to 30 seconds. A separate cold Windows run reached the earlier deadline despite passing launch/upgrade runs; allow startup time without closing the app early or assuming success.
- Add a delayed-acknowledgment regression. App shutdown still requires the correct attempt ID and a verified waiting receipt; exits, errors and missing acknowledgment keep the app open.
- Include the v1.8.1 GUI update bridge, actual Electron/NSIS checks, and the redesigned Your voice desktop studio described below.

From 1.7.2 or 1.8.0, run this win-x64 installer directly once. Those installed versions still contain the detached PowerShell launcher. Existing settings, History and appearance choices are preserved.

---

## Bring the studio into the app, fix the updater launch — v1.8.1

- Make **Your voice** the first sidebar destination and the default workspace. Carry the approved prototype into the actual desktop layout: generous typography, paper cards, an output studio beside the recorder, a mixed library, a focused word editor, and Paper/Night views. Keep the real microphone, History, word rules, cue review and visible HUD output choices connected.
- Disable Finish while a take is processing and keep Cancel available. The recorder meter uses actual incoming audio levels.
- Fix the reproduced “helper exited before shutdown (code 0), empty output” failure. Windows PowerShell exited without executing with the detached launch option; a non-detached hidden launch acknowledged startup in both Node and Electron. Use a staged GUI bridge that survives Electron shutdown and starts a non-detached PowerShell child. Keep hidden windows and the startup acknowledgment.
- Use the production launcher in the native installer smoke test. Add an Electron test that runs the actual UpdateLauncher, verifies acknowledgment before app.quit(), waits for the helper to survive Electron exit, verifies replacement bytes and sees the target restart. Tests use disposable synthetic executables.
- Recognize a manually recovered running version without claiming the earlier automatic attempt succeeded; preserve its report.
- Include bounded launcher metadata (stage, detached mode, helper PID, exit code/signal) in the update report. No settings, API keys or transcripts are read into the report.

**Recovery from 1.7.2 or 1.8.0:** those versions contain the old detached launcher. Quit from the tray and run the new win-x64 installer directly once. Installing over the existing app keeps local settings and History. A download cannot replace the updater code before its old handoff has run. Future update handoffs use the corrected launcher; real microphone/paste/recognition behavior still needs desktop testing.

---

## Your voice, at your fingertips — v1.8.0

- Combine Vocabulary and Voice practice into **Your voice**: one output preview, recorder, correction form, searchable word/take library, local playback and audio-cue review. Existing settings and History migrate in place.
- Make tag placement and category pills visible. Choose **Before words**, **After words**, or **Context below**; include emotion, delivery, pacing and nonverbal sounds independently. Copy corrected words, words with saved tags, or structured JSON.
- Put the same choices and **Copy words / Copy with tags** directly on the HUD, including during recording. Keep word corrections in both formats. Copying and presentation changes never start an inference call or rewrite previously inserted text. Allow 15 seconds to copy after finishing; Dismiss still closes immediately.
- Add a separate, default-off automatic cue option: at most one paid audio call on the first 30 seconds after a take. Keep timestamp scope on every printed cue; later speech stays untagged. Keep manual excerpts, editable model slug, per-take feedback and separate usage accounting.
- Persist words before analysis, preserve them if the optional model fails, and reject late results after cancellation. Capture/tail flushing and words-only insertion remain intact. Automatic analysis may add finish latency and requires the existing OpenRouter audio capability/policy checks.
- Expand emotion labels to angry/upset, filter output without altering saved interpretations, and preserve explicit user labels with the clear-only filter. Edited transcripts discard obsolete word alignment while retaining explicitly time-scoped audio cues.
- Update the theory, workflow, privacy notes, diagrams and linked source map. The browser design lab has the same visible output choices and still makes no paid requests.

Real audio interpretation remains experimental. Automated provider tests use simulated responses; they do not establish emotion accuracy. Neutral-reference conditioning, acoustic model training, automatic personal noise shortcuts and live phrase-level tagged insertion remain future work.

**Updating:** the v1.7.2 installer safeguards and diagnostic reports are included. If you are still on v1.5.1 and its Restart button only closes the app, quit from the tray and run the new **win-x64 installer EXE directly** once. Existing local data is retained. The portable EXE is a separate package.

---

## Publish the verified installer intact — v1.7.2

- Preserve the publishable installer by running native upgrade tests on a temporary copy. Verify the original build artifact remains unchanged after the test.
- Refuse release publication unless both installed and portable EXEs exist, and publish the native smoke-test report alongside checksums.
- Include the acknowledged updater handoff, .NET SHA-256 verification and in-app reports described below. The incomplete 1.7.1 release was withdrawn before an installed-app EXE was available; use 1.7.2 directly for recovery.

## Verify the installer handoff — included in v1.7.2

- Replace the helper's `Get-FileHash` dependency with streaming .NET SHA-256. The native Windows regression reproduced a helper environment where that PowerShell function is unavailable; verification still uses SHA-256 before and after handoff.
- Keep the app open until the PowerShell helper verifies the payload and acknowledges the specific attempt. Early exit, failure to launch, or a 10-second startup timeout is shown in the app instead of closing silently.
- Save a pending receipt, helper script and stdout/stderr diagnostics before shutdown. Report incomplete or mismatched-version receipts on next launch and pause automatic downloads after a failed handoff.
- Target the current installed directory explicitly with NSIS `/D=` and `--updated`. Wait for installer completion, check its exit code and verify the app's ProductVersion at the original path before reporting success or removing the payload.
- Add Open downloaded installer, an in-app View/Copy update report, and Open update diagnostics controls. The direct installer is rechecked before launch; no uninstall or history deletion is required. Reports read only update-owned files and are not uploaded automatically.
- Add a disposable Windows CI test that installs the published 1.5.1 NSIS package, upgrades it with the new installer in a path containing spaces/apostrophes/percent/ampersand, verifies startup acknowledgment, and rejects a zero-exit no-op installer.

These changes are in the new app. A broken 1.5.1 handoff cannot replace its own updater code; quit from the tray and run the new installer file directly for the first recovery. A real-user failure still needs its local receipt/logs to establish the cause.

## Emotion and delivery, in your control — v1.7.0

- Add experimental Speech cues in Settings → Voice intelligence: an independent audio-understanding model, emotion-label selection, delivery/monotone cues, pacing, laughter/sighs, optional style guidance and assessment filtering.
- Analyze a selected retained audio excerpt of up to 30 seconds in Transcript Review. Off by default, explicitly requested, separately billed through OpenRouter. Verify audio chat plus structured-output capability; require the provider data-collection policy without silent fallback.
- Review timestamped model interpretations, relabel or dismiss them while preserving the original result, then copy expressive text or versioned structured context for an AI chat. Original transcript and live insertion remain unchanged.
- Measure local energy, clipping and quiet intervals without calling those measurements emotion detection. Track cue attempts in Usage & spend, with unknown costs kept unknown.
- Cancel on request or Review closure, prevent duplicate analyses, reject invalid labels/timestamps and ignore results for deleted/changed takes. Provider errors preserve previous analysis and saved words.
- Add a README-linked concept guide with theory, diagrams, source/test map and a step-by-step test path.

- Group completed Voice practice takes by intended phrase and recognizer model. Compare original recognition, show recent outcomes and retained audio counts, and offer Practice again.
- Exclude missing raw text and unfinished takes from match counts. Edited text and Vocabulary substitutions do not count as recognition successes. Counts describe current History, not accent quality or acoustic learning.
- Document the longer-term personal-word correction and speech-cue architecture, model candidate, cost example, consent boundaries and evaluation criteria. Contextual word correction and acoustic personalization are future work; manual cue analysis is experimental.

Automated model tests use simulated responses; real paid audio-model accuracy, latency and availability are not established. Audio understanding does not reveal actual internal feelings. Native Windows execution requires desktop testing. See CONCEPTS.md for the test steps and PRIVACY.md for data handling.

## A comfortable first minute — v1.6.0

- Add a three-step welcome tour with an optional real name, nickname or handle; appearance and HUD preview; an explicit recovery-audio choice; and a walkthrough of shortcuts, Copy, Review, History and Vocabulary.
- Save and exit at any step. If settings cannot be saved, input remains available for retry and there is an explicit unsaved exit.
- Add Settings → Profile & tour to rename yourself, clear the name, replay the tour or restore the getting-started checklist.
- Add Overview setup shortcuts for speech settings, the microphone test and the tour. Configuration alone is never labeled a successful provider connection.
- Personalize the workspace greeting and relevant name placeholders. Names remain local and are not automatically sent to speech providers or added as vocabulary rules.
- Improve narrow-window navigation and settings-tab wrapping. Preserve existing History, credentials, engine choices and audio-retention settings across migration.

The tour does not request microphone access or make paid speech calls. Browser previews use simulated speech/sample data; native Windows dictation and update execution remain separate desktop checks.

The 1.5.1 updater safeguards remain included. If you are still on 1.4.0 after a stalled update, stop its old helper loops and run the current x64 installer directly rather than retrying its in-app updater. Existing settings/history stay in the same user-data folder. See UPDATE_TROUBLESHOOTING.md.
