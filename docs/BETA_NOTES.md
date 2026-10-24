## Voice memory beta — v1.10.0-beta.5

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
