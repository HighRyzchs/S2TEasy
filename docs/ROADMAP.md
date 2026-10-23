# Roadmap

## Implemented in v1.9.0

- Personal words with learned misheard variants (including multi-word forms), kinds, clips and fix counts; phrase-aware live typing that never types half a learned phrase; engine hints for OpenRouter and local engines, opt-in Deepgram key terms through router.audio.
- One HUD: start, pause and resume on the shortcut, a paused session finishing by itself, click-to-edit while talking, a remember pill, safe in-place replacement of typed text, copy, a per-session cue switch and seven recolorable styles.
- The redesigned app: Home, Your voice (Words, Practice, Expression), History with app icons and playback, a local Usage analytics page, a HUD screen and a single-page Settings.
- Live speech cues per phrase on the HUD, per-app cue rules, a monthly limit for paid extras, an opt-in context check for accent fixes, an accent check exercise, and an on-screen HUD test.

## Implemented in v1.8.0

- Unified Your voice workspace with output, recording, word rules, playback and cue review.
- Visible output placement/category pills and plain/tagged copy on the HUD.
- Separate opt-in for one bounded first-30-seconds post-take audio interpretation call; durable words survive enrichment failure.
- [Workflow, theory and linked function map](OUTPUT_WORKSPACE.md).

- Ordered incremental batch processing and session-aware recorder IPC.
- Checkpointed transcript history, temporary recovery audio, error/interruption states.
- Streaming adapter, OpenRouter audio chat adapter, local speech server adapter.
- Theme controls, HUD customization and placement, non-activating overlay behavior.
- Explicit vocabulary rules, transcript corrections, dedicated no-insertion voice practice, opt-in whole-take audio/text export.
- Contribution docs, privacy documentation, project website, test/build workflows.
- Optional personal profile, replayable welcome tour, and contextual setup checklist.
- Local spend charts and CSV export; transcript review with explicit Vocabulary suggestions and genuine provider-timed word clips.
- Experimental opt-in audio emotion/delivery/pacing/event analysis on selected retained excerpts, per-take cue editing, expressive/structured copying and separate usage accounting. [Concepts, architecture and code map](CONCEPTS.md).

## Next product improvements

- **Guided diagnostics:** test the selected microphone, authentication, model slug and audio operation separately, with an actionable result for each stage. Cloud transcription test costs must be explicit; never make paid calls automatically.
- **Speech commands and snippets:** opt-in commands for paragraphs, punctuation, and reusable text, with a literal-dictation mode to avoid surprising replacements.
- **Per-app profiles:** beyond the speech-cue rule shipped in v1.9.0, choose a shortcut, formatting preference and vocabulary set for writing, email, chat or coding.
- **Cues typed inline:** live cues show on the HUD today; typing them into the app as they are heard (holding a phrase until its cue arrives) and on-device detection of pauses and pace are next.
- **Portable preferences:** export/import vocabulary and non-secret preferences, with previews before applying changes. Keep API keys and audio out of exports by default.
- **Accessibility pass:** keyboard navigation, screen-reader announcements, reduced motion and larger HUD controls, verified with native Windows assistive tools.

These are proposed features, not capabilities shipped in v1.9.0.

## Release validation

- Real two-minute and ten-minute dictation on Windows with each engine.
- Provider protocol checks, paid account tests, and measured transcription latency.
- Installer, upgrade, hold-to-talk, clipboard/focus, multiple displays, and overlay checks.
- Accessibility audit, signed Windows binaries, and release provenance review.

## Pronunciation learning

See [Personal words and expressive speech](PERSONAL_SPEECH_DESIGN.md) for the longer-term correction/cue architecture, initial OpenRouter candidate, example costs and evaluation plan. Contextual word correction and acoustic personalization remain future work. Manual and separately opted-in bounded automatic audio cue analysis are implemented experimentally; [follow its code and test it](CONCEPTS.md).

The development build now groups completed practice takes by intended phrase and model, comparing original recognition and showing retained audio examples. It does not score accent quality or establish acoustic adaptation.

1. Extend the practice mode with take-level re-labeling and progress over repeated phrases, preserving recognized text separately from intended labels.
2. Provider-specific keyterm adapters after verifying each provider's API and limits. v1.9.0 sends hints to OpenRouter and local engines and offers experimental Deepgram `keyterm` through router.audio; confirm whether router.audio passes it on and add the other providers it routes to.
3. Optional word timestamps and alignment, with user-reviewed audio/text labels; do not infer word boundaries from plain text.
4. Evaluate vocabulary prompts and acoustic models on held-out recordings per speaker/language. Report word error rate and name accuracy before/after, with enough samples to be useful.
5. Explore a compatible local recognizer with LoRA/fine-tuning or provider custom vocabulary. A handful of word drills is insufficient to promise general accent adaptation. Export/upload and training cost require explicit user action.

## Longer term

- Continuous cue analysis, validated personal acoustic baselines and a versioned integration SDK after the manual excerpt workflow has real-world quality/cost measurements.
- Managed local model downloads with checksum verification, disk/memory estimates, and cancellation.
- Smarter bounded recovery segmentation with silence overlap and alignment to avoid cutting words at recovery boundaries.
- Timestamp-aware streaming final reconciliation across providers; no automatic replay of already-inserted phrases.
- Faster bounded recording recovery and stronger power-loss durability testing.
- Native macOS/Linux dictation integrations if maintainers can test those platforms.
