# Store listing copy

Paste-ready content for the Chrome Web Store (and, with minor trims, AMO).
Everything inside a code block below is meant to be copied verbatim into the
matching console field: no markdown markers, no artificial line wrapping.
Assets live in `docs/store/`. Review before submitting, especially the data
disclosures, which are legal statements by the publisher.

## Basics

- **Name**: LingoChunk Recorder
- **Category**: Education
- **Language**: English
- **Privacy policy URL**: https://lingochunk.com/privacy
- **Support / homepage URL**: https://github.com/lingochunk/lingochunk-recorder

## Summary (short description field, max 132 characters)

```text
Record language lessons, from your mic or a lesson tab, and send them to LingoChunk for transcripts and Anki flashcards.
```

## Description (long description field)

```text
Press record at the start of your language lesson, press stop at the end, and send it to your LingoChunk account. A little later the whole conversation is in your library as an interactive, word-by-word transcript with native audio, ready for listening practice and Anki flashcards.

WHAT IT DOES

- Records your microphone, for in-person lessons, tutoring sessions or recording yourself
- Records an online lesson in one click: your microphone and the lesson's browser tab (Google Meet, Zoom web, italki and similar) are mixed into a single recording, and you never have to leave the tab
- Or records just the lesson tab, without switching your microphone on at all
- Recording is local-first: audio is saved on your device every few seconds while you record, so a crash loses seconds, not the hour. Nothing is sent anywhere until you press "Send to LingoChunk"
- Set-and-forget: auto-stop after your lesson length (presets or a custom number of minutes), optional automatic send, and an optional email when processing finishes
- Failed sends stay on your device for retry, and a badge on the icon reminds you of recordings not yet sent

YOU NEED a free LingoChunk account (https://lingochunk.com). Connecting is one click and creates a narrowly-scoped access token you can revoke at any time from LingoChunk settings.

PRIVACY, PLAINLY

Audio stays on your device until you choose to send it. Sends go only to your own LingoChunk account over HTTPS. No analytics, no third parties. Open source: https://github.com/lingochunk/lingochunk-recorder
```

## Privacy tab

**Single purpose** (paste):

```text
Record language-lesson audio (microphone, optionally mixed with a lesson tab's audio) and upload it to the user's own LingoChunk account for language-learning processing.
```

**Permission justifications** (paste each into its field):

`storage`:

```text
Keeps recordings on the user's device until they choose to send them, plus user settings.
```

`identity`:

```text
One-click account connection via LingoChunk's authorise page (launchWebAuthFlow).
```

`tabCapture`:

```text
Records the lesson tab's audio when the user picks a tab source in the popup.
```

Host permission `lingochunk.com`:

```text
Uploading recordings to the user's own LingoChunk account.
```

Optional host permissions:

```text
Only requested if the user configures a self-hosted LingoChunk server.
```

**Data usage disclosures**: tick *Personal communications* (audio the user
records), *Website content* (lesson-tab audio the user chooses to capture)
and *Authentication information* (the LingoChunk access token, stored
locally, only ever sent to lingochunk.com). Then tick the certifications:
data is not sold, not used for purposes unrelated to the single purpose,
not used for creditworthiness. All data is transmitted only to the user's
own LingoChunk account at the user's explicit action.

**Remote code**: No (no bundler, no eval, no CDN scripts).

## Assets

- Icon 128x128: shipped inside the package (`src/icons/icon-128.png`)
- Screenshots (1280x800): `docs/store/screenshot-recorder.png`,
  `docs/store/screenshot-popup.png`, `docs/store/screenshot-recording.png`
  (mid-recording with the auto-stop countdown)
- Promo tiles: optional, skip for the first submission
