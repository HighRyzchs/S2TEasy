## Verify the installer handoff — v1.7.1

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
