# Roadmap

## Implemented in this development version

- Ordered incremental batch processing and session-aware recorder IPC.
- Checkpointed transcript history, temporary recovery audio, error/interruption states.
- Streaming adapter, OpenRouter audio chat adapter, local speech server adapter.
- Theme controls, HUD customization and placement, non-activating overlay behavior.
- Explicit vocabulary rules, transcript corrections, dedicated no-insertion voice practice, opt-in whole-take audio/text export.
- Contribution docs, privacy documentation, project website, test/build workflows.
- Optional personal profile, replayable welcome tour, and contextual setup checklist.
- Local spend charts and CSV export; transcript review with explicit Vocabulary suggestions and genuine provider-timed word clips.

## Next product improvements

- **Guided diagnostics:** test the selected microphone, authentication, model slug and audio operation separately, with an actionable result for each stage. Cloud transcription test costs must be explicit; never make paid calls automatically.
- **Speech commands and snippets:** opt-in commands for paragraphs, punctuation, and reusable text, with a literal-dictation mode to avoid surprising replacements.
- **Per-app profiles:** choose a shortcut, formatting preference and vocabulary set for writing, email or coding; keep app matching local.
- **Portable preferences:** export/import vocabulary and non-secret preferences, with previews before applying changes. Keep API keys and audio out of exports by default.
- **Accessibility pass:** keyboard navigation, screen-reader announcements, reduced motion and larger HUD controls, verified with native Windows assistive tools.

These are proposed features, not capabilities shipped by the welcome-tour release.

## Release validation

- Real two-minute and ten-minute dictation on Windows with each engine.
- Provider protocol checks, paid account tests, and measured transcription latency.
- Installer, upgrade, hold-to-talk, clipboard/focus, multiple displays, and overlay checks.
- Accessibility audit, signed Windows binaries, and release provenance review.

## Pronunciation learning

1. Extend the practice mode with take-level re-labeling and progress over repeated phrases, preserving recognized text separately from intended labels.
2. Provider-specific keyterm adapters after verifying each provider's API and limits.
3. Optional word timestamps and alignment, with user-reviewed audio/text labels; do not infer word boundaries from plain text.
4. Evaluate vocabulary prompts and acoustic models on held-out recordings per speaker/language. Report word error rate and name accuracy before/after, with enough samples to be useful.
5. Explore a compatible local recognizer with LoRA/fine-tuning or provider custom vocabulary. A handful of word drills is insufficient to promise general accent adaptation. Export/upload and training cost require explicit user action.

## Longer term

- Managed local model downloads with checksum verification, disk/memory estimates, and cancellation.
- Smarter bounded recovery segmentation with silence overlap and alignment to avoid cutting words at recovery boundaries.
- Timestamp-aware streaming final reconciliation across providers; no automatic replay of already-inserted phrases.
- Faster bounded recording recovery and stronger power-loss durability testing.
- Native macOS/Linux dictation integrations if maintainers can test those platforms.
