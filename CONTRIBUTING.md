# Contributing

Thanks for helping make dictation more dependable and accessible.

Use Node.js 22 LTS, run `npm ci`, then `npm test`, `npm run typecheck`, and `npm run build`. `npm run ui` previews the interface using mock IPC. Native dictation needs Windows; see [the smoke test](docs/WINDOWS_TESTING.md).

Open an issue describing the user-visible problem before a large change. Small fixes can go directly to a pull request. Include the behavior before and after, relevant tests, and screenshots for interface changes. Preserve API-key isolation, recoverable transcript checkpoints, and opt-in training retention. Keep provider tests mocked unless a maintainer explicitly runs a paid integration check.

For recognition bugs, include engine/model, language, and a synthetic or consented example. Do not attach somebody else's voice or real confidential dictation. Never include API keys or raw app data. Accessibility and international language improvements are welcome.

Pronunciation features must distinguish deterministic corrections, vocabulary prompts, and acoustic model training. Claims of improved recognition need an evaluation set and measured results.

Contributions are licensed under the project's MIT license. Be respectful, assume good intent, and focus reviews on behavior and evidence rather than the tools or people who wrote the code.
