# Optional S2Teasy Cloud: product proposal

This is a proposal, not an implemented payment or hosted-transcription system. The open source app, bring-your-own-key mode, and local speech remain available. A paid service would sell managed transcription without requiring users to create separate provider accounts.

## Product

Use prepaid credits with a clear estimate in audio minutes. “Tokens” are confusing for speech and differ by provider. Show the exact rate before a session, available balance, recording usage, and a spending cap. Start with small packs, no automatic recharge by default, and add subscriptions only if users want recurring usage.

An illustrative pricing experiment is $10 for 300 minutes of standard audio. That is about 3.3 cents of revenue per minute. If measured all-in processing cost were 1 cent per minute, the processing contribution would be $7 per pack before payment fees, hosting, refunds, taxes, and support. These are assumptions, not provider price quotes or a profit forecast. Benchmark the chosen engines, silence billing, retries, long recordings, and optional cleanup before setting a rate. Premium models should have an explicit different credit rate.

## Minimum service architecture

- An authenticated gateway between the desktop app and the speech provider. Provider credentials remain on the server; distributing them in an open source client is not a credential-control strategy.
- A payment provider suitable for the business's country. Stripe Checkout is one option; a merchant of record may be useful if its terms support this product. Use hosted checkout rather than handling card data in Electron.
- A durable credit ledger. Verified, idempotent payment webhooks add credits. Reserve enough credits before a recording; settle actual successful usage and release unused reservations. Never trust a client-reported balance or duration.
- Usage measured and enforced on the server, with per-user/session limits, maximum recording durations, rate limits, and chunk/session idempotency. A repeated request must not become a repeated charge. Failed takes should not silently consume a user's purchased balance; partial-success policy must be stated clearly.
- Streaming from the client to the gateway with short-lived user authentication, then to the provider. Deliver finalized text and recovery status independently of the billing UI. Recovery and retries need an explicit charging policy.
- Account history, receipts, consumption breakdown, and support/refund tools. Do not retain raw audio or transcripts on the gateway by default; explain any upstream provider retention policy.

## First experiment

Validate the Windows app with a small group before charging. Measure transcription quality, cost per successful minute, latency, failed recordings, and willingness to pay. Then pilot one standard engine and prepaid packs. Avoid offering every model or an unlimited plan until costs and abuse patterns are understood.

The service earns its place through simpler onboarding, predictable prices, good recovery, privacy choices, and support. Users who prefer self-hosting can keep using the open source app. The MIT license permits commercial services; preserve the supplied license/attribution and choose an upstream provider whose terms support the intended hosted use.

## Useful follow-up features

- Optional per-app writing profiles: concise messages in chat, verbatim text in notes, and technical vocabulary in an editor.
- Selection-aware “rewrite this” with a visible before/after review and undo; never silently alter already-inserted words.
- Timestamped audio playback from a corrected word, once real word timing/alignment is implemented.
- Provider health and latency feedback, with an explicit fallback choice rather than surprising changes to privacy or credit rate.
- A session cost/balance indicator for hosted mode and budget alerts before credits run out.

No production account system, checkout, credits, payment webhook, or hosted provider proxy has been built in this version.
