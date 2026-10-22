# Reporting a security issue

Do not post credentials, private audio, or an exploitable security issue in a public bug report. Use this repository's GitHub **Security → Report a vulnerability** flow if available. If private reporting is not enabled, contact the maintainer through the contact method on their GitHub profile and ask for a private reporting channel before sending sensitive details.

Include the affected version, platform, a minimal reproduction with synthetic data, and the impact. Avoid using real user recordings as proof. Maintainers should enable private vulnerability reporting before the first public release.

The app uses OS credential encryption, Electron context isolation/sandboxing, and local session checkpoints. Audio/history files themselves are not encrypted. See [privacy documentation](docs/PRIVACY.md) for retention and provider data flows. OS disk encryption is recommended for sensitive dictation.
