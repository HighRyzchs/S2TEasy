# Architecture

**Proposed personalization architecture:** [Personal Acoustic Memory](PERSONAL_ACOUSTIC_MEMORY.md) explains how an ordinary correction becomes a portable sound-to-word memory, with diagrams, source integration points, user experience, and evaluation gates. This is future work, distinct from the current implementation below.

S2Teasy is Electron + React + TypeScript. The Electron main process owns credentials, network requests, storage, shortcut registration, and Windows text insertion. A hidden renderer captures the microphone. The main window and recording HUD receive state through a typed preload bridge with context isolation and sandboxing.

## Capture and processing

`MicSession` captures mono audio, resamples to 16 kHz, and produces 250 ms PCM frames. All engines can checkpoint frames locally. router.audio forwards frames to its WebSocket. OpenRouter and Local speech use bounded VAD clips (at most roughly 15 seconds) and one ordered transcription/insertion queue. Final insertion mode uses the same chunk pipeline but waits until stop to paste; no unlimited full-session buffer is built.

Every recorder event includes the main process's session generation. Audio IPC is accepted only from the hidden recorder. Stale events cannot be attributed to a newer session. Start/stop commands are serialized in the recorder. Cancel invalidates pending initialization immediately and detaches the old queue; late microphone permission results release their tracks, and a fresh session can start without waiting for the old promise. Audio contexts explicitly resume, and the hidden recorder permits audio startup without a user gesture. Settings are snapshotted at start. A finishing session blocks a new recording until it completes or is cancelled. Stop becomes Cancel during processing. Failed HUDs automatically hide after eight seconds while journaled work stays recoverable. Missing microphone data and stalled finishing have bounded timeouts. Cancellation aborts outstanding HTTP requests.

Provider partials are displayed and checkpointed separately as unconfirmed text; only finals enter the insertion queue. Finalized text is journaled before paste, then inserted when requested. The streaming adapter accepts the legacy router.audio payload shapes; actual provider protocol/latency still requires a live account test. Finalization has a bounded six-second drain, which cannot guarantee every provider will respond in time. Retained audio offers recovery if the provider ends early or fails.

## Persistence

`SessionJournal` appends PCM to independent files and writes session metadata using a flushed temporary file and rename. Metadata checkpoints also flush the associated audio. `Store` upserts History by session ID and atomically replaces its settings/history JSON. On startup, in-progress journals become interrupted sessions. The journal is the recovery source if the main store missed the last update.

Audio capture and insertion are different outcomes. A failed paste retains the transcript and audio and marks the session as needing attention. A failure never silently replaces visible text with an empty transcript. Cancellation invalidates in-flight requests' results and keeps saved work. Recovery transcribes retained PCM in bounded chunks, does not paste into external apps, and preserves the old text if the retry fails.

History correction stores the original engine text separately. Vocabulary rules are explicit, bounded, Unicode-aware substitutions applied once per finalized segment. Whole-take exports remain available. Optional provider word timestamps are offset into the session sample clock; local playback uses a validated session ID and supports WAV byte ranges. A user can explicitly save a timed word slice with 150 ms context as a labeled practice example. Untimed takes are never presented as accurately aligned. Acoustic model training is not implemented.

## Trust boundaries

Cloud keys stay in main-process requests. OpenRouter credentials are never used as a router.audio fallback. Local transcription permits loopback endpoints only, refuses redirects, and sends no cloud authorization header. Audio files and transcript text are personal data, not encrypted credentials. The renderer's browser-only preview is mock IPC and cannot establish desktop behavior.

The Windows injector captures the target before the HUD appears, restores focus without activating the HUD, and simulates paste. It reports missing native support/focus failures rather than claiming insertion. Windows elevation boundaries and apps that reject synthetic paste need manual verification. Update binaries require GitHub's SHA-256 digest and are checked again before execution.

## Audio contracts and overlay assets

OpenRouter auto routing reads `/models?output_modalities=text,transcription` (five-minute in-memory cache). `audio → transcription` models use the official STT JSON `input_audio` contract at `/audio/transcriptions`. `audio → text` chat models use audio content parts at `/chat/completions`. A manual API-operation selector supports new slugs without guessing or switching paid providers. Local endpoints retain their OpenAI-compatible multipart contract. No unsupported keyterm/diarization options are attached to dedicated ASR by default. Official references: [OpenAPI schema](https://openrouter.ai/openapi.json), [TypeScript SDK STT operations](https://github.com/OpenRouterTeam/typescript-sdk).

Live waveform levels derive from the same post-gain PCM consumed by dictation. The editor/site’s optional microphone preview measures levels locally; it never transcribes, stores, or uploads audio. Uploaded PNG/JPEG/WebP assets are decoded and resized to at most 512 px, re-encoded as PNG, and embedded in local theme settings. SVG, remote URLs, and executable theme content are not accepted. CSS provides the liquid-glass appearance; blur through desktop windows depends on OS composition and is not guaranteed by browser backdrop filters.

## Stop, review and local usage

Stop begins a configurable capture tail, marks VAD as finalizing (40 ms minimum voiced speech), drains queued worklet messages using an acknowledgement, flushes resampling/PCM buffers, and then sends completion. Short trailing batch audio receives 200 ms of quiet decoder context. Cancel resolves pending waits and invalidates capture immediately. Duration comes from the sample clock rather than network latency.

The HUD review action suppresses pending insertion before showing the main-window editor. History edits require recording/recovery to be idle. A bounded word alignment helper proposes short substitutions; additions, deletions, punctuation and capitalization alone do not automatically become rules. Vocabulary and practice actions are explicit.

Usage measurements are separate from History. Each HTTP attempt records its response cost if supplied, with one operation ID across retries; local speech records no API charge, streaming costs are unknown. Storage failures produce a visible warning and never discard dictated text. The dashboard sums reported costs and deduplicates retry audio duration. CSV exports omit transcript/audio/credentials and escape spreadsheet formulas.

HUD theme imports normalize an allowlist of styling fields and bounded raster data. Downloaded SVG is a design source; it cannot be imported as executable HUD content. Arbitrary CSS/scripts/remote assets are unsupported. Placement offsets are clamped to the active display work area.
