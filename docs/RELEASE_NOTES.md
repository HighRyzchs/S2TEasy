## Unreleased — personal speech foundations

- Group completed Voice practice takes by intended phrase and recognizer model. Compare original recognition, show recent outcomes and retained audio counts, and offer Practice again.
- Exclude missing raw text and unfinished takes from match counts. Edited text and Vocabulary substitutions do not count as recognition successes. Counts describe current History, not accent quality or acoustic learning.
- Document the proposed personal-word correction and optional speech-cue architecture, model candidate, cost example, consent boundaries and evaluation criteria. Contextual correction and cue recognition are not implemented in this development build.

## A comfortable first minute — v1.6.0

- Add a three-step welcome tour with an optional real name, nickname or handle; appearance and HUD preview; an explicit recovery-audio choice; and a walkthrough of shortcuts, Copy, Review, History and Vocabulary.
- Save and exit at any step. If settings cannot be saved, input remains available for retry and there is an explicit unsaved exit.
- Add Settings → Profile & tour to rename yourself, clear the name, replay the tour or restore the getting-started checklist.
- Add Overview setup shortcuts for speech settings, the microphone test and the tour. Configuration alone is never labeled a successful provider connection.
- Personalize the workspace greeting and relevant name placeholders. Names remain local and are not automatically sent to speech providers or added as vocabulary rules.
- Improve narrow-window navigation and settings-tab wrapping. Preserve existing History, credentials, engine choices and audio-retention settings across migration.

The tour does not request microphone access or make paid speech calls. Browser previews use simulated speech/sample data; native Windows dictation and update execution remain separate desktop checks.

The 1.5.1 updater safeguards remain included. If you are still on 1.4.0 after a stalled update, stop its old helper loops and run the current x64 installer directly rather than retrying its in-app updater. Existing settings/history stay in the same user-data folder. See UPDATE_TROUBLESHOOTING.md.
