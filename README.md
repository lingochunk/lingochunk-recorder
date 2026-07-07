# LingoChunk Recorder

A browser extension that records your language lessons and sends them to
[LingoChunk](https://lingochunk.com), where they become interactive transcripts,
native-audio practice material and Anki flashcards.

Built for one job: press record at the start of a lesson with your teacher or
language partner, press stop at the end, press upload. A little later the whole
conversation is in your LingoChunk library with a word-by-word transcript.

## How it works

- **Recording is local-first.** Audio is written to your browser's local
  storage (IndexedDB) every few seconds while you record. No internet
  connection is needed to record, and nothing is sent anywhere until you press
  Upload. If the browser crashes mid-lesson, you lose a few seconds at most.
- **Upload when ready.** One click sends the recording to your LingoChunk
  account for processing (transcription, translation, vocabulary extraction).
  If the upload fails, the recording stays on your device and you can retry.
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

Click the extension icon, then **Connect to LingoChunk**. A LingoChunk window
opens; sign in if needed and click **Authorise**. That's it.

What happens underneath: LingoChunk mints a personal access token restricted to
the **Upload audio** scope and hands it straight to the extension. The token
can't read your vocabulary, export decks or touch anything else, and you can
revoke it at any time in LingoChunk → Settings → API tokens. You can also paste
a token manually (useful for self-hosted servers; set the server URL in the
extension's settings panel first).

## Recording an online lesson (Chrome)

For lessons that happen in a browser tab (Google Meet, Zoom web, italki, a
YouTube video), Chrome can record the tab's audio and your microphone together,
so both sides of the conversation land in one recording:

1. Open the lesson tab and **click the LingoChunk icon there** (this is what
   permits the capture — Chrome only allows an extension to record tabs it was
   invoked on)
2. In the recorder, choose **Microphone + tab: …** as the source
3. Record as usual — you'll keep hearing the tab while it's captured

Wear headphones, otherwise the teacher's voice reaches your microphone too and
ends up in the recording twice. If the lesson tab is closed mid-recording, the
recording stops gracefully and everything captured so far is kept.

## Privacy

- Audio stays on your device until you press Upload.
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
  background.js  toolbar click → open/focus the recorder tab
  recorder.*     the recorder page (all UI lives here)
  lib/
    db.js        crash-safe IndexedDB chunk store
    recording.js MediaRecorder session (5s timeslices)
    api.js       LingoChunk public API client (/api/v1)
    auth.js      one-click connect (identity.launchWebAuthFlow)
    uploader.js  upload with retry + processing poll
scripts/build.mjs  copies src + the right manifest into dist/<browser>
```

No bundler, no minification: the shipped files are the source files. That is a
deliberate choice to keep store review and code audit trivial.

## Roadmap

- Store listings (Chrome Web Store, Firefox Add-ons)
- Pause/resume within a recording
- Per-source volume levels for mic + tab recordings

## Licence

MIT
