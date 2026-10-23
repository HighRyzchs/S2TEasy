# Personal words and expressive speech

Status: proposed architecture. The current app has explicit Vocabulary replacements, labeled local practice takes, optional provider word timings, and practice recognition summaries. Contextual LLM correction, acoustic matching, and cue recognition are **not implemented**. This document defines how to add them without losing live text or misrepresenting what the app has learned.

## Experience

Keep three independent, initially disabled features: **Personal word suggestions**, **Grammar & phrasing**, and **Speech cues**. Recording and ordinary dictation must work without them. Their setup explains which text/audio leaves the device and the extra cost. Choosing local transcription must not silently enable cloud processing.

After a correction, offer: “Remember this name or phrase?” Show the recognized text, intended spelling, language and optional context (for example, a contact or project). The user chooses an exact Vocabulary rule or a contextual personal-word entry. A generic word such as “mirror” must not become a universal replacement for a name.

On a personal-word card, show spelling, known misrecognitions, optional phonetic hint, saved recordings and recent recognition outcomes. Offer “Say it naturally” and an optional short sentence, then listen back, label, replace or delete the take. Do not ask users to change their accent. Support multiple languages, code-switching, names, acronyms and phrases without assigning an ethnic or national accent label.

The current practice summary compares **original recognition** against the target, grouped by target and model. It ignores case and ordinary punctuation, preserves diacritics and internal apostrophes/hyphens, and excludes unfinished takes or missing raw text. It measures recognizer matches, not pronunciation quality. History deletion changes the available sample count. Drill success is not evidence of improvement on unseen speech.

## Personal word pipeline

1. Save raw finalized STT text and its session/segment revision before any enrichment. Keep existing streaming partials responsive.
2. Retrieve a small set of relevant, user-confirmed personal entries locally using known misrecognitions, language and local phrase context. Never send the entire vocabulary, history or clip archive for every chunk. Users can opt specific entries out of cloud context.
3. Apply only explicit deterministic Vocabulary rules as today. Make at most one bounded contextual correction request per eligible finalized phrase, debounced at a phrase boundary. Do not run an open-ended tool-using agent or send each partial revision.
4. Send raw phrase, a short context window and candidate IDs/intended spellings/known confusions as data. Instruct the model to preserve meaning, abstain when unsure and return a bounded list of edits. Spoken instructions inside the transcript must not override the system policy. No tools, web access or model-selected network operations.
5. Validate every edit locally: segment revision, exact source span, non-overlapping integer offsets, permitted candidate ID and exact intended replacement. Reject malformed, invented or stale edits. Keep insertion/deletion, numbers, dates and negations out of automatic personal-word repair. A model's claimed confidence alone is not sufficient authorization.
6. Start with reviewable suggestions. Accepted and rejected edits update local evidence for that entry/context; do not immediately create a global replacement. Include undo and “Stop suggesting this.” Review acceptance is feedback, not proof of acoustic similarity.

Use one documented offset convention (UTF-16 code units, matching JavaScript) and reject boundaries splitting surrogate pairs. Require exact source text and a hash/revision of the original segment. Never use fuzzy offsets to apply an LLM edit.

**Live insertion:** once text has been pasted, enrichment can suggest an edit in Review/History but must not backspace into another app. A later optional “polished phrases” mode can briefly buffer a finalized phrase before its first insertion, with a visible delay control, strict deadline and raw-text fallback. Cancel aborts pending work; late results cannot paste after cancellation or into a new session. Grammar/style edits stay separate so polishing cannot silently change literal dictation.

Initial engineering budgets: 1,000–2,000 input tokens, 200 output tokens, one request in flight, bounded queue, no automatic fallback to a more expensive model, and a configurable session budget. These are targets to test, not achieved latency guarantees. On timeout, rate limit, budget exhaustion or unsupported schema, keep the raw transcript and make the enrichment status visible. Record every attempt in local Usage & spend under its own task category, including failures, unknown costs and any reasoning tokens actually billed. Text/token estimates alone cannot enforce an exact dollar ceiling when provider prices or unreported costs change.

## Model candidate and cost

Public OpenRouter catalogue checked 2026-10-23; prices and routes can change. No paid inference or accuracy/latency benchmark was run for this design.

| Role | Initial candidate | Listed text input / output per million tokens |
| --- | --- | --- |
| Constrained personal-word suggestions | `google/gemini-2.5-flash-lite` | $0.10 / $0.40 |
| Text-only comparison candidate | `openai/gpt-4.1-nano` | $0.10 / $0.40 |
| Optional audio second opinion | Evaluate an audio-input model separately | Audio billing and clip duration need separate measurement |

The first candidate advertises both structured output and audio input, but the initial correction request should use **text only**. Keep the speech recognizer model slug separate from the correction model slug. A transcription-only endpoint cannot run this editing task.

At exactly 1,000 input and 100 output text tokens, a check costs $0.00014; 1,000 checks cost $0.14 before transcription, audio requests, retries, extra tokens and account/payment fees. Do not send a full corrected transcript back if a short edit list suffices. Check provider support using `require_parameters` and the schema format; require an explicitly acceptable provider data policy, and expose no-route failures instead of silently loosening it. These routing settings do not replace a user's review of provider retention terms.

Sources: [live model catalogue](https://openrouter.ai/api/v1/models), [Flash-Lite listing](https://openrouter.ai/google/gemini-2.5-flash-lite), [GPT-4.1 nano listing](https://openrouter.ai/openai/gpt-4.1-nano), [API schema](https://openrouter.ai/openapi.json).

## What a pronunciation file can teach

Create a versioned local personal-word record with an opaque ID, intended text, optional language/context/phonetic hint, confirmed misrecognitions, enabled state and feedback events. Reference labeled practice takes by opaque session ID, with actual timing ranges only when supplied by the provider or a verified aligner. Store audio availability separately: retention expiry must remove clip-derived features and invalidate references without deleting a user's written vocabulary rule. Users can separately delete the word, its feedback, or its recordings. Export is explicit and excludes credentials.

A text-only model cannot hear recordings. A stored WAV plus spelling does not retrain the recognizer. To use pronunciation acoustically, evaluate a phonetic-content encoder/alignment method on a short candidate audio span against the user's labeled examples. General speaker embeddings identify vocal characteristics; they are not a reliable word matcher. Include similar-sounding negative examples, phrase context and language. Compare against keyword biasing and a compatible personalized recognizer rather than assuming a handful of embeddings is enough.

If timing is absent, offer a user-selected region or a whole short take; do not invent word boundaries. Audio second-opinion requests need their own opt-in, bounded clip length and cost disclosure. Never upload old takes in the background. Genuine fine-tuning is a later, separately measured feature, not a progress meter attached to the word list.

## Speech cues

The recorded waveform contains delivery information; the plain transcript discards much of it. Current volume bars do not constitute an emotion detector. Start with audio-derived observations: voiced/silent intervals, pause duration, relative energy, and speaking rate when trustworthy alignment is available. Relative pitch and emphasis need voiced-frame pitch extraction, a personal baseline and validation across microphones; automatic gain control and noise make volume comparisons unreliable. Represent missing/poor audio as unavailable, not a confident label.

Treat laughter, sighs and similar events as detector outputs requiring their own acoustic model and evaluation. “Excited,” “uncertain,” “frustrated,” and sarcasm are context-dependent interpretations. Keep them optional, tentative and editable; do not infer them solely from punctuation, loudness or the transcript. Abstain when evidence is weak or the speaker is ambiguous. Do not infer medical states, personality, protected attributes or honesty.

Use a local event record with session/segment ID, time range, observable feature/evidence, detector and version, source (`audio-measurement`, `audio-model`, or `user`), and optional interpretation. Detector scores must not be presented as calibrated probabilities until tested. Preserve original output separately from user corrections. Offer “That was emphasis,” “Playful,” “Literal,” “Ignore this cue,” and optional labeled examples; adaptation claims require evidence on new takes. Users must be able to turn emotion interpretations off while keeping pauses and pacing.

Provide **Plain text**, **Expressive text** and **Structured context** copy/export options. Plain text remains the default for arbitrary applications. A richer export could look like:

```json
{
  "schemaVersion": 1,
  "text": "I thought that was the plan.",
  "cues": [
    {
      "startMs": 920,
      "endMs": 1540,
      "kind": "pause",
      "source": "audio-measurement",
      "durationMs": 620
    },
    {
      "startMs": 0,
      "endMs": 2800,
      "kind": "delivery",
      "label": "playful",
      "source": "user"
    }
  ]
}
```

This is an illustrative future payload, not a current API response or measured recording. Separate cues from quoted speech so an LLM can distinguish the words from annotations. Integrations must explicitly consume that structure; pasting plain text into an arbitrary chatbot cannot guarantee richer behavior. Treat dictation content as untrusted data, never as integration instructions. A future adapter/SDK should negotiate schema versions and supported cue types and let users inspect exactly what will be shared. Cues stay off in normal typing unless the user explicitly chooses an expressive output.

## Delivery and evaluation

1. **Now:** per-target/model raw-recognition summaries and retained example counts. No new cloud calls or acoustic learning claims.
2. **Personal words:** versioned records, explicit correction feedback, optional short practice labels and retrieval; one constrained, opt-in text correction request with review, undo and cost logging.
3. **Measured cues:** local pause/voicing analysis, quality checks, timestamps and previewable exports; no emotion claim.
4. **Acoustic personalization and interpreted cues:** evaluate chosen audio models, personal baselines and held-out labels before adding opt-in delivery suggestions or suggesting improvements.

Test names versus ordinary-word confusions, unseen sentences, numbers/negation, multiple languages/code-switching and microphone changes. Measure raw STT versus exact Vocabulary versus contextual correction, false corrections per 1,000 words, name accuracy, user rejection rates, added phrase latency and all billable attempts. Split by recording/session so the same take cannot appear in training and evaluation. Practice recognition summaries alone must not be marketed as model improvement.

For cues, measure timestamp accuracy and false events, interpretation agreement and abstention on held-out, user-labeled takes across noise conditions. Establish release thresholds before tuning, report sample sizes and avoid population-wide accent claims from one person's recordings. Verify offline mode, disabled modules, unavailable audio, deleted clips, disk errors, API/schema errors, transcript prompt injection, cancellation, late results and already-inserted text. None may lose original words or produce a surprise external paste.
