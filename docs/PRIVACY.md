# Privacy and local data

The desktop app stores settings/history in `%APPDATA%\s2teasy\s2teasy.json` on Windows. Session checkpoints and retained PCM audio live in its `sessions/` directory. Audio is mono PCM16 at 16 kHz. Exported WAVs have standard headers and a JSON sidecar with the corrected text, original recognition, model, language hint, and sample rate.

**On this computer:** history, vocabulary, recovery audio, and optional pronunciation examples. Audio and transcripts are unencrypted app files. Windows DPAPI protects API keys via Electron safeStorage; keys are not saved when OS encryption is unavailable. Legacy plaintext credentials are read for migration, but new writes require encryption. A corrupt settings file is preserved with an `.unreadable-<timestamp>` suffix before defaults are used. Session journals contain no credentials.

**To your chosen provider:** streaming sends PCM audio to router.audio; OpenRouter sends WAV clips and language/vocabulary hints to OpenRouter and its model provider. Those services have their own retention policies and billing. Local speech sends clips to the configured loopback service; that service's model-download and telemetry behavior is outside this app. Enabling a local engine does not alter other software's policies.

**Recovery:** finalized text is saved before paste. Recovery audio is enabled by default and disclosed in the interface. Successfully inserted audio is deleted unless successful-take retention is enabled. Failed/interrupted/cancelled audio remains for recovery and expires after the configured 1–30 days. Cleanup runs at startup and hourly while idle; it cannot run while the app is closed. Temporary files are ordinary files; power loss can lose the latest unflushed audio. If disk writes fail, an error is shown; recovery cannot be guaranteed on a failed disk.

**Training:** successful-take retention is opt-in and local. No training API, voiceprint, background training, or dataset upload is implemented. Corrections change transcript text and explicit vocabulary rules. Whole-take WAV/text exports require a user-selected save location. Deletion and retention in this app do not delete files you exported or data already sent to a provider.

**Deletion:** deleting History entries removes their session metadata and audio. Clearing History removes the visible retained sessions. History keeps up to 400 sessions, deleting older app-managed recordings. OS backups, provider logs, exported files, and unreadable-store backups must be managed separately.

The app contains no analytics integration. Update checks contact GitHub when manually requested or when auto-update is enabled. Automatic updates are off by default. Do not submit API keys, real dictation history, or private audio in public bug reports.
