# Architecture

S2Teasy is Electron + React + TypeScript. The Electron main process owns credentials, network requests, storage, shortcut registration, and Windows text insertion. A hidden renderer captures the microphone. The main window and recording HUD receive state through a typed preload bridge with context isolation and sandboxing.

## Capture and processing

`MicSession` captures mono audio, resamples to 16 kHz, and produces 250 ms PCM frames. All engines can checkpoint frames locally. router.audio forwards frames to its WebSocket. OpenRouter and Local speech use bounded VAD clips (at most roughly 15 seconds) and one ordered transcription/insertion queue. Final insertion mode uses the same chunk pipeline but waits until stop to paste; no unlimited full-session buffer is built.

Every recorder event includes the main process's session generation. Audio IPC is accepted only from the hidden recorder. Stale events cannot be attributed to a newer session. Start/stop commands are serialized in the recorder to handle asynchronous microphone initialization. Settings are snapshotted at start. A finishing session blocks a new recording.

Provider partials are display-only. Finalized text is journaled before paste, then inserted when requested. The streaming adapter accepts the legacy router.audio payload shapes; actual provider protocol/latency still requires a live account test. Finalization has a bounded four-second drain, which cannot guarantee every provider will respond in time. Retained audio offers recovery if the provider ends early or fails.

## Persistence

`SessionJournal` appends PCM to independent files and writes session metadata using a flushed temporary file and rename. Metadata checkpoints also flush the associated audio. `Store` upserts History by session ID and atomically replaces its settings/history JSON. On startup, in-progress journals become interrupted sessions. The journal is the recovery source if the main store missed the last update.

Audio capture and insertion are different outcomes. A failed paste retains the transcript and audio and marks the session as needing attention. A failure never silently replaces visible text with an empty transcript. Cancellation invalidates in-flight requests' results and keeps saved work. Recovery transcribes retained PCM in bounded chunks, does not paste into external apps, and preserves the old text if the retry fails.

History correction stores the original engine text separately. Vocabulary rules are explicit, bounded, Unicode-aware substitutions applied once per finalized segment. Audio/text exports are whole-take labels, not aligned word clips or acoustic training.

## Trust boundaries

Cloud keys stay in main-process requests. OpenRouter credentials are never used as a router.audio fallback. Local transcription permits loopback endpoints only, refuses redirects, and sends no cloud authorization header. Audio files and transcript text are personal data, not encrypted credentials. The renderer's browser-only preview is mock IPC and cannot establish desktop behavior.

The Windows injector captures the target before the HUD appears, restores focus without activating the HUD, and simulates paste. It reports missing native support/focus failures rather than claiming insertion. Windows elevation boundaries and apps that reject synthetic paste need manual verification. Update binaries require GitHub's SHA-256 digest and are checked again before execution.
