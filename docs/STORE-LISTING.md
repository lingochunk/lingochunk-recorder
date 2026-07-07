# Store listing copy

Paste-ready content for the Chrome Web Store (and, with minor trims, AMO).
Assets live in `docs/store/`. Review before submitting — especially the data
disclosures, which are legal statements by the publisher.

## Basics

- **Name**: LingoChunk Recorder
- **Summary** (short description, ≤132 chars):
  > Record language lessons — from your mic or a lesson tab — and send them to LingoChunk for transcripts and Anki flashcards.
- **Category**: Education
- **Language**: English
- **Privacy policy URL**: https://lingochunk.com/privacy
- **Support / homepage URL**: https://github.com/lingochunk/lingochunk-recorder

## Description (long)

> Press record at the start of your language lesson, press stop at the end,
> and send it to your LingoChunk account. A little later the whole
> conversation is in your library as an interactive, word-by-word transcript
> with native audio — ready for listening practice and Anki flashcards.
>
> WHAT IT DOES
> • Records your microphone — for in-person lessons, tutoring sessions or
>   recording yourself
> • Records an online lesson in one click: your microphone and the lesson's
>   browser tab (Google Meet, Zoom web, italki, YouTube…) are mixed into a
>   single recording, and you never have to leave the tab
> • Recording is local-first: audio is saved on your device every few seconds
>   while you record, so a crash loses seconds, not the hour — and nothing is
>   sent anywhere until you press "Send to LingoChunk"
> • Set-and-forget: auto-stop after your lesson length (15–90 min), optional
>   automatic send, and an optional email when processing finishes
> • Failed sends stay on your device for retry; a badge on the icon reminds
>   you of recordings not yet sent
>
> YOU NEED a free LingoChunk account (https://lingochunk.com). Connecting is
> one click and creates a narrowly-scoped access token you can revoke at any
> time from LingoChunk settings.
>
> PRIVACY, PLAINLY
> Audio stays on your device until you choose to send it. Sends go only to
> your own LingoChunk account over HTTPS. No analytics, no third parties.
> Open source: https://github.com/lingochunk/lingochunk-recorder

## Privacy tab answers

- **Single purpose**: Record language-lesson audio (microphone, optionally
  mixed with a lesson tab's audio) and upload it to the user's own LingoChunk
  account for language-learning processing.
- **Permission justifications**:
  - `storage` — keeps recordings on-device until sent, plus user settings
  - `identity` — one-click account connection via LingoChunk's authorise page
  - `tabCapture` — records the lesson tab's audio when the user picks
    "Record mic + this tab"
  - Host `lingochunk.com` — uploading recordings to the user's account
  - Optional host permissions — only requested if the user configures a
    self-hosted LingoChunk server
- **Data usage disclosures** (tick and phrase to match the console's wording):
  - Collects: *Personal communications* (audio the user records) and
    *Website content* (lesson-tab audio the user chooses to capture);
    *Authentication information* (the LingoChunk access token, stored
    locally, never transmitted anywhere except lingochunk.com).
  - All data is used solely to provide the extension's single purpose,
    transmitted only to the user's own LingoChunk account at the user's
    explicit action; nothing is sold, shared with third parties, or used for
    unrelated purposes.
- **Remote code**: none (no bundler, no eval, no CDN scripts).

## Assets

- Icon 128×128: shipped inside the package (`src/icons/icon-128.png`)
- Screenshots (1280×800): `docs/store/screenshot-recorder.png`,
  `docs/store/screenshot-popup.png`
- Promo tiles: optional; skip for the first submission
