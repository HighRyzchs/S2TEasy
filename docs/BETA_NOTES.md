## Voice memory beta — v1.10.0-beta.11

**New: S2Teasy Cloud (test mode).** Settings → Speech engine → **S2Teasy Cloud**. No accounts with speech providers and no keys:
- Sign in with Google in your browser. You get 30 free minutes.
- Top up with a credit pack: 20 hours for $5, 60 hours for $12, 150 hours for $25.
- Redeem a promo code if you have one.

Each recording uses its length in seconds. Speech goes to Groq's Whisper and is not stored by S2Teasy. Your words arrive after each pause, as with OpenRouter.

**Payments are in test mode for this beta.** No real money moves. To try a top-up, use Stripe's test card `4242 4242 4242 4242`, any future date and any CVC.

---

## Voice memory beta — v1.10.0-beta.10

**Your last word is kept.** When a take ends softly (quieter, a little higher), the engine often drops the last word. S2Teasy now:
- sends the engine half a second of silence before asking it to finish, so it hears that you stopped and commits the last word;
- keeps the last one to three words if the live preview heard them but the engine's final text left them out;
- keeps up to four last words the engine never finished, instead of sending the whole take to History for review.

**New in Speech tidy: your habit words** (Your voice → Structure). Pick the words you say to fill a gap while you think, such as "yeah", "like", "you know" or "okay so", or add your own. They go only where they fill a gap:
- opening a sentence ("Yeah so I had an idea" → "I had an idea");
- between commas ("it was, like, great" → "it was great");
- at the end after a comma ("…done, yeah." → "…done.");
- capitalised after a pause ("so Yeah something" → "so something").

"I like it" and "You know what I mean?" stay as they are. Nothing is taken out until you pick your words.

**Pause breaks now also fix capitals in the middle of a sentence.** After a pause, the engine often starts the next word with a capital: "the issue I'm Facing", "to Actually render", "And That's". Everyday words are lowered. Names you've taught S2Teasy, and words that are often names (Mark, Will, May), keep their capitals.

**About voice commands:** a command needs a short pause before and after it, the way you found yourself. Without one, "next line" in flowing speech can't be told apart from a sentence about a next line.

---

## Voice memory beta — v1.10.0-beta.9

**New: voice commands for structure** (Your voice → **Structure**). Say a command on its own, between sentences, and it shapes the text instead of being typed:
- "new paragraph" or "new stanza" starts a new paragraph after a blank line.
- "new line" moves to the next line, for example the next line of a poem.
- "bullet point …" starts a "- " line.
- "next number …" starts the next numbered line: "1. ", "2. "…

The HUD shows each command as a small chip in your text. Click a chip and clear it to take the break back out. You can add your own phrases for each command. A phrase needs two words or more, and a command inside a sentence ("I started a new paragraph today") stays as words. The line breaks go into your app as you talk, and History and Copy keep them.

**Moved:** Speech tidy now sits in Your voice → Structure, next to the voice commands. Settings is for the app itself.

**The app window fits half a laptop screen:**
- It can shrink to 540 px wide.
- In narrow windows the sidebar becomes an icon rail, and each icon names itself when you hover over it.
- The Settings section tabs scroll instead of being cut off.
- On/off settings are proper switches, and every dropdown and text box has the same look.
- The HUD page's preview shrinks to fit the window.

---

## Voice memory beta — v1.10.0-beta.8

**The HUD's clicks, rebuilt from the ground up.** Earlier betas made the HUD's big transparent window let clicks through, then tried to guess when the pointer was over the HUD so it could take them back. That guess depended on hover, display scaling and timing, and kept failing on real machines. Now the window's own shape is the HUD: Windows itself sends a mouse click, a finger tap or a pen press on the HUD to the HUD, and everywhere else to the app underneath. Nothing is guessed anymore.

Also fixed:
- **Clicking text while you talk:** new words scrolled the text under your pointer, so the word you aimed at moved before you let go. The text now holds still while the mouse is over it, and a press that ends on a word picks that word.
- **After an edit, the keyboard went to the wrong window** (Windows hands it to the next window in line when the HUD lets go). It now goes straight back to the app you are dictating into.
- **Touch and pen:** dragging across words works, and the editor stays open after a tap (there is no hover to keep it open).
- The cyberpunk HUD's "VOICE.LINK" tab is no longer cut off.

Checked on a Windows test machine with the real mouse, keyboard and finger touch while another app is in front, at 100% and 150% display scaling, three HUD styles, one-line and expanded: clicking the text, editing words (twice in a row), dragging across words, Copy, Pause, editing while paused, Done, and two quick taps on Pause. 259 of 259 checks passed, and none of the typing leaked into the app in front.

**New: Speech tidy.** It takes the stumbles out of what you said and keeps your own words. It does not reword or polish. Settings → **Speech tidy** has a switch for each kind, and a box to try it on your own sentences:
- **Stutters:** "I I want", "I, I want", "th- the", "b-b-but", "to the, to the store".
- **Fillers:** um, uh, erm.
- **Corrections:** "the store, I mean the mall" becomes "the mall". It also handles "sorry", "no wait", "scratch that", and a short start you say again ("I want to, I want to go").
- **Pause breaks:** a full stop and capital the engine put in where you paused mid-thought. "I went to the. Store" becomes "I went to the store". Names keep their capitals.

It runs by itself on every take: piece by piece while live typing, and over the whole take at the end. The HUD's editor (click the words, or pause) also has a **Tidy** button that rewrites the take in your app.

It leans towards leaving text alone. Lists ("I need milk, I need eggs"), apologies ("I am sorry, I…"), numbers ("dial 9 9 9"), words said twice on purpose ("very very", "bye bye", "go, go, go") and real sentence ends are kept.

**Other languages you mix in** (Settings → Speech tidy): Tagalog, Arabic, Hindi/Urdu.
- Their doubles ("araw araw", "dahan dahan", "yalla yalla", "jaldi jaldi") are never taken for stutters.
- For Arabic and Hindi you choose how the words are written: in English letters as heard ("yalla", "inshallah"), or in their own script ("يلا", "إن شاء الله"). The script uses a built-in list of common words for now.
- You can also list your own words said twice on purpose.

What the speech engines are told about your languages:
- **OpenRouter audio models** (chat-style) get a written note: which languages you mix in, and how to write them.
- **Whisper-style models on OpenRouter** (for example Whisper on Groq) get it as Whisper's prompt, together with your personal words. This only applies when Groq or OpenAI is the provider serving the request.
- **The live engine (router.audio)** takes no written note. With Deepgram as its provider there is an experimental switch, **Live engine: listen for them too**, that turns on Deepgram's mixed-language mode. router.audio may ignore or reject it; turn it off if dictation stops working.

---

## Voice memory beta — v1.10.0-beta.7

**Fixed in beta 7:** on some Windows setups (display scaling, pen or touch) a click on the HUD went to the app underneath, so Done, Pause, Copy and edits did nothing. When a press lands on the HUD while its window was still letting clicks through, S2Teasy now plays that press to the HUD itself. Checked on a Windows test machine with the real mouse, including a run where the pointer is never reported over the HUD.

**New:** HUD → **Copy HUD diagnostics** copies what the HUD did with your recent clicks, for bug reports.


**Fixed in beta 6** (each checked by clicking the real HUD in the running app, all seven styles, one-line and expanded, on a virtual Linux desktop; Windows-only behaviour such as keyboard focus still needs your test):
- **Done while you talk.** The HUD had no Done button while recording, only Pause; it is there now in every layout.
- **Done during "Pausing…".** That moment showed only a spinner; Done is there now, and Copy stays available while it pauses or finishes.
- **Two quick taps on Pause = Done.**
- **Pause or Done while the engine is reconnecting** (right after Resume) no longer throws the take away; it waits until the microphone is open.
- **Caption style:** the "Remember this fix?" pill covered the Copy button; it now opens above the words.
- The auto-finish countdown could stay on hold after Resume.
- Clicks could be dropped if the HUD refreshed its click-through state mid-click.

**Fixed in beta 5:**
- Editing a word on the HUD while a text box in another app (such as a browser) was selected: Windows kept the keyboard in that app, so your typing went there instead of the HUD. The HUD now takes the keyboard explicitly when you click a word, and hands it back when you finish.
- Done did nothing while a pause was still settling the last words. It now finishes as soon as they are in.

**Fixed in beta 4:** after the first edit on the HUD, it could stop taking clicks (Copy, Pause, words) for the rest of the session. Handing the keyboard back to your app reset Windows' click-through state behind S2Teasy's back; the HUD now re-applies the right state continuously and always takes clicks while you edit.

**From beta 3:**
beta builds now update themselves. While you run a beta, **Check for updates** also looks at newer betas (and the final release); stable builds still only ever see full releases. Install this one directly once; later betas arrive in the app.

**Fixed in beta 2:** clicks on the HUD (words, Pause, every button) went through to the app underneath on some Windows setups, so live edits were impossible. The HUD window used to wait for Windows to report the pointer over it, which it does not reliably do for a click-through window; S2Teasy now checks the pointer position itself and takes clicks wherever the HUD is drawn.

---


**A test build.** Stable versions never offer betas in the app; download this x64 installer to join. Installing it over v1.9.0 keeps your settings and History. From beta 3 on, a beta updates to newer betas and to the final v1.10.0 in the app.

### What is new

**Voice memory (beta).** Fix a few misheard words on the HUD while you talk, and S2Teasy keeps the *sound* of what you said with the words you meant. The next time it hears that sound, in any later session, it underlines the words on the HUD so one click fixes them, or fixes them for you in Auto mode.

- Off by default: **Your voice → Voice memory → Remember how I say my words on this device**.
- Everything runs on your PC. Sound examples are stored as voice fingerprints (MFCC features, not recordings), encrypted with Windows' own data protection, and never uploaded.
- It needs word timings from your speech engine. Deepgram reports them, so router.audio streaming should work; for OpenRouter or local engines, turn on **Word timestamps** in Settings. If the HUD says the sound could not be found, your engine did not send them.
- The Voice memory tab lists what it remembers, lets you forget single examples or everything, and keeps a **test log** with a score for every match (lower is surer).

This is the first stage of the [Personal Acoustic Memory](https://github.com/HighRyzchs/S2TEasy/blob/main/docs/PERSONAL_ACOUSTIC_MEMORY.md) design: correction binding and on-device matching with classic features and dynamic time warping. It has been tested on synthetic audio only; real voices, microphones and accents are what this beta is for.

### How to test it

1. Install, open **Your voice → Voice memory**, and turn it on.
2. Dictate a sentence with a name or phrase the engine gets wrong, e.g. "gg no re" or your name.
3. On the HUD, click the wrong words, type the right ones, press Enter. The HUD should say **Remembered how you say "…"**. If it says the sound could not be found, your engine is not sending word timings.
4. Start a new session and say the phrase again in a different sentence. It should be underlined on the HUD; click it and press Enter to accept (that also adds a second example).
5. Try Auto-fix, a quieter voice, faster speech, another microphone, and sentences with similar-sounding words that should *not* change.
6. Check the test log. If real matches score above the threshold or wrong ones below it, move the Sensitivity slider and tell us the scores you saw.

### Also in this build

- "Support on Ko-fi" in Settings → App & updates.
- Version ordering understands pre-releases, so beta testers are offered the final release.
