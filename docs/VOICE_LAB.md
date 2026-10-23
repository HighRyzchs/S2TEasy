# Your voice · one output-first workspace

[Open the working prototype](https://highryzchs.github.io/S2TEasy/voice-lab/).

The voice lab now combines personal words, sound shortcuts, expression tags and voice references on **one page**. One recorder supplies one output preview and one library. Vocabulary and emotion controls no longer occupy separate navigation destinations. Desktop v1.8.0 now ships a real unified workspace and HUD output controls. See [desktop instructions and code map](OUTPUT_WORKSPACE.md); the browser lab still has its own sample data and session-only reference experiments.

## Try the complete loop

1. **Start with the output.** The example combines real vocabulary rules with illustrative delivery tags. `shiv on` becomes `Siobhán`, while `[excited]` remains a delivery label.
2. **Click a word** to remember a correction. The small editor opens over the same page; saving changes the output immediately. Clicking an existing personal name opens its existing rule.
3. **Click a [tag]** to correct or omit its interpretation. The inline editor returns keyboard focus to the tag, or to the output heading if the tag was omitted. Escape closes it.
4. Choose **With expression**, **Plain words**, or **JSON**, then **Copy output**. Placement, category and clear-only pills are always visible. Use **Copy words** or **Copy with tags** directly; word corrections stay in both.
5. **Record once** in the try-it corner. Supply the spoken words, then choose **Measure this take locally**. The browser does not perform speech recognition. Approximate WPM updates when you edit the supplied text.
6. Choose how the take sounded and **Remember this delivery**, or keep an ordinary take as the neutral reference. Both appear in the same library. These labels are yours, not model predictions.
7. Use **Add something** for a word, phrase, sound shortcut, expression example, or neutral reference. Word and sound editors can explicitly attach the **last completed take**, so they do not open another microphone recorder.
8. Expand **Models & interpretation** below the library to edit speech and Gemini cue-model IDs in place. Usage & spend remains its own navigation destination because it is an analytics view.

The library filters **Everything / Words & phrases / Sounds / Expressions & references** keep the same page and shared state. Search spans the saved words and session references. **Replay & compare** opens a saved reference in the shared recorder’s player; **Remove** deletes it. Reset restores example cards and model preferences and discards session audio and references after confirmation.

## What works, and what is a demonstration

| Area               | This prototype                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One output         | Word rules and selected expression tags compose into the same copied result. Words are editable through personal rules; labels are edited separately.                                                  |
| Personal words     | Add, edit, delete, search, filter and pause cards. Text drafts persist in this browser.                                                                                                                |
| Corrections        | The desktop app’s actual whole-word/phrase correction function, applied inside each finalized phrase. Rules never run on rendered tag labels. Cross-phrase replacements are deliberately not invented. |
| Expression tags    | Example interpretations, or explicit user labels on a personal take. Phrase correction, omission, category filtering, plain output and JSON provenance work.                                           |
| Recording          | Real local microphone capture, volume meter and playback; at most 15 seconds per take. Exactly one capture component on the page.                                                                      |
| Local measurements | Approximate pitch, digital energy, quiet-frame fraction and supplied-word WPM. Compare with a user-approved neutral take. No emotion classifier.                                                       |
| Voice references   | One neutral reference and up to eight labeled examples, stored in page memory with their audio and supplied words.                                                                                     |
| Sound shortcuts    | A label, intended text and optional completed audio example. **No automatic sound-to-word recognition.** Sound labels never become vocabulary replacements.                                            |
| Models             | Inline, editable browser preferences. No API key, compatibility lookup, cloud opt-in or paid request. Desktop settings are unchanged.                                                                  |
| Usage & spend      | Clearly labeled sample data with dictation, recovery and voice-cue filters. No account connection or historic billing import.                                                                          |

Desktop audio interpretation and a separately opted-in first-30-seconds automatic request are implemented in v1.8.0. Automatic tagged insertion into external apps and personal acoustic calibration remain planned. See [Expressive transcription](EXPRESSIVE_TRANSCRIPTION.md) for the intended audio-to-tags architecture and its current boundaries.

## Privacy, recording and persistence

The page makes no paid or AI request. The microphone opens only when you press Record. Stop, cancel, opening a card editor or reset dialog, switching to Usage, hiding the page, or leaving releases capture. Replaying a saved reference first cancels active capture. A late microphone permission response after dismissal is also cleaned up. Word editors play an existing take; they do not create another recorder.

Text cards and model preferences use `s2teasy-voice-lab-v1`, separate from desktop data, and remain until reset or browser storage deletion. Up to 100 cards are kept. If storage is blocked, the page reports that text changes are temporary. Do not enter secrets into example fields.

Audio, attached word examples and reference profiles stay in page memory and disappear on reload. Attaching a completed take is explicit. These examples are not uploaded and do not retrain a model. Opening an editor stops the microphone rather than recording behind its dialog. Playback stops and object URLs are revoked when the relevant player closes or changes source.

Changing the output format does not grant permission for a future cloud audio service. The desktop integration has independent opt-ins for paid audio analysis and automatic requests; browser choices do not affect those opt-ins.

## Gemini and older spend in the desktop app

Speech recognition and speech-cue analysis have different model IDs. In desktop v1.8.0, choose the OpenRouter speech model under **Settings → Speech engine → Audio model slug**. The optional audio-understanding model is on **Your voice → Audio intelligence & model settings** (also available in Settings → Voice intelligence); the starting candidate is `google/gemini-2.5-flash-lite`. The prototype places both fields on the same page, with their purpose labeled. Audio/provider compatibility still matters.

The desktop app records usage locally from provider responses to its own calls. It does **not** import historical OpenRouter account activity. Calls made before local usage logging, on other devices, or in other clients do not appear automatically. Text history cannot reconstruct missing provider costs. Unknown prices remain unknown, not zero. The sample billing categories describe workflow tasks, not separate OpenRouter invoices.

## Code map

- [VoiceWorkspace](../src/renderer/src/VoiceWorkspace.tsx): one preview, tag inspector, recorder, mixed library, reference profiles and inline model fields.
- [Page and card editor](../src/renderer/src/voice-lab-main.tsx): browser draft persistence, word/sound editing, explicit completed-take attachment and usage preview.
- [Expression example fixtures](../src/renderer/src/voice-workspace-data.ts): illustrative scenarios, not actual model responses.
- [Combined transcript formatter](../src/shared/expressive-transcript.ts): vocabulary inside finalized phrases, separate allowlisted tags, output filtering and provenance.
- [Vocabulary rules](../src/shared/vocabulary.ts): the correction function also used by the desktop app.
- [Local prosody](../src/shared/prosody.ts): bounded acoustic analysis, supplied-word pace and neutral-reference deltas.
- [Shared recorder](../src/renderer/src/VoiceLabRecorder.tsx): permission, bounded capture, live volume and cleanup.
- [Completed-take player](../src/renderer/src/VoiceClipPreview.tsx): card-editor playback without another microphone request.
- [Browser draft boundaries](../src/renderer/src/voice-lab-data.ts): text-card validation, model preferences and sample billing data.

Build with `npm run build:site`, serve `.site/` and visit `/voice-lab/`. The website workflow publishes the browser lab independently of desktop releases.
