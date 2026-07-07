# LingoChunk Recorder

A browser extension that records your language lessons and sends them to
[LingoChunk](https://lingochunk.com), where they become interactive transcripts,
native-audio practice material and Anki flashcards.

Built for one job: press record at the start of a lesson with your teacher or
language partner, press stop at the end, send it to LingoChunk. A little later
the whole conversation is in your library with a word-by-word transcript.

## How it works

- **Recording is local-first.** Audio is written to your browser's local
  storage (IndexedDB) every few seconds while you record. No internet
  connection is needed to record, and nothing leaves your device until you
  press "Send to LingoChunk". If the browser crashes mid-lesson, you lose a
  few seconds at most.
- **Send when ready.** One click sends the recording to your LingoChunk
  account for processing (transcription, translation, vocabulary extraction).
  If the send fails, the recording stays on your device and you can retry.
- **Optional collections.** Pick one of your LingoChunk collections and the
  recording is published straight into it.

## Browser support

| Capability | Chrome / Chromium | Firefox |
|---|---|---|
| Record from microphone | yes | yes |
| Crash-safe local storage, retry upload | yes | yes |
| One-click connect | yes | yes |
| Record an online lesson (your mic + the lesson tab, mixed) | yes | not possible (browser limitation) |

## Install

Store listings are coming; until then, install from source:

```bash
git clone https://github.com/lingochunk/lingochunk-recorder.git
cd lingochunk-recorder
npm install
npm run build
```

**Chrome / Chromium / Edge / Brave**

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and choose the `dist/chrome` folder

**Firefox**

Temporary (resets when Firefox restarts):

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and choose `dist/firefox/manifest.json`

For a permanent Firefox install you need a signed build; grab the `.xpi` from
the [releases page](https://github.com/lingochunk/lingochunk-recorder/releases)
once available, or see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Connecting your account

Click the extension icon → **Open recorder** → **Connect to LingoChunk**. A
LingoChunk window opens; sign in if needed and click **Authorise**. That's it.

What happens underneath: LingoChunk mints a personal access token restricted to
the **Upload audio** scope and hands it straight to the extension. The token
can't read your vocabulary, export decks or touch anything else, and you can
revoke it at any time in LingoChunk → Settings → API tokens. You can also paste
a token manually (useful for self-hosted servers; set the server URL in the
extension's settings panel first).

## Recording

Click the toolbar icon and the popup offers one-click recording, right where
you are:

- **Record microphone** — for in-person lessons or recording yourself
- **Record mic + "\<this tab\>"** (Chrome, on web pages) — for lessons that
  happen in a browser tab (Google Meet, Zoom web, italki, a YouTube video):
  the tab's audio and your microphone are mixed into one recording

You stay on the lesson tab the whole time: the capture runs in a background
recorder tab, the toolbar icon shows a red **REC** badge, and clicking the
icon again offers Stop. The full recorder page (icon → **Open recorder**)
handles uploads, history, languages and settings, and can also start
recordings directly.

Set-and-forget options: an **auto-stop timer** (15–90 minutes — set it to
your lesson length and never tape an hour of empty room), **send
automatically** when recording stops, and the completion **email**. With all
three on, the entire workflow is two clicks: record at the start, and an
email arrives when the transcript is ready. Recordings that are still only
on this device show as a count on the toolbar icon so nothing is forgotten.

Notes for tab recordings: wear headphones, otherwise the teacher's voice
reaches your microphone and ends up in the recording twice. You keep hearing
the tab while it's captured. If the lesson tab closes mid-recording, the
recording stops gracefully and everything captured so far is kept. The very
first recording asks for microphone access via the recorder page once.

## Privacy

- Audio stays on your device until you press “Send to LingoChunk”.
- Uploads go only to the LingoChunk server configured in settings, over HTTPS,
  into your own account.
- The extension collects no analytics and talks to no third party.

## Development

```bash
npm install
npm run build          # assemble dist/chrome and dist/firefox
npm test               # unit tests (vitest)
npm run lint:firefox   # validate the Firefox build with web-ext
npm run run:firefox    # launch Firefox with the extension loaded
```

There is also a real-browser smoke test that loads the built extension into
Chromium with a fake microphone and exercises record → persist → stop:

```bash
PLAYWRIGHT_FROM=/path/to/any/project/with/playwright/package.json node e2e/smoke.mjs
```

### Project layout

```
manifest/        per-browser MV3 manifests (chrome.json, firefox.json)
src/
  popup.*        toolbar popup: one-click record/stop remote control
  recorder.*     the recorder page (recording host, uploads, settings)
  lib/
    db.js        crash-safe IndexedDB chunk store
    recording.js MediaRecorder session (5s timeslices) + mic/tab mixing
    tabaudio.js  lesson-tab arming + tabCapture (Chrome)
    api.js       LingoChunk public API client (/api/v1)
    auth.js      one-click connect (identity.launchWebAuthFlow)
    uploader.js  send with retry + processing poll
scripts/build.mjs  copies src + the right manifest into dist/<browser>
```

No bundler, no minification: the shipped files are the source files. That is a
deliberate choice to keep store review and code audit trivial.

## Roadmap

- Store listings (Chrome Web Store, Firefox Add-ons)
- Pause/resume within a recording
- Per-source volume levels for mic + tab recordings

## Project layout note

`src/background.js` exists solely to restore the unsent-recordings badge
after a browser restart; all real logic lives in the popup and recorder page.

## Licence

MIT
