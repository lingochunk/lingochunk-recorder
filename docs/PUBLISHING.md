# Publishing runbook

How to ship LingoChunk Recorder to the extension stores. Written for the
maintainer; nothing here is needed to use or develop the extension.

## Build the store artefacts

```bash
npm ci
npm test
npm run lint:firefox
npm run build -- --zip
```

This produces `dist/lingochunk-recorder-chrome.zip` and
`dist/lingochunk-recorder-firefox.zip` (requires the `zip` CLI). The chrome
zip has the manifest's dev-only `key` field stripped automatically - the
Chrome Web Store rejects packages that contain it.

Listing copy and privacy-tab answers are pre-written in
[STORE-LISTING.md](STORE-LISTING.md); screenshots are in `docs/store/`.

Before every release:

1. Bump `"version"` in BOTH `manifest/chrome.json` and `manifest/firefox.json`
   (and `package.json` to keep them aligned).
2. Run the smoke test against the built extension
   (`PLAYWRIGHT_FROM=... node e2e/smoke.mjs`).
3. Tag the release in git (`git tag v0.1.0 && git push --tags`).

## Chrome Web Store

One-time setup:

1. Register as a Chrome Web Store developer at
   https://chrome.google.com/webstore/devconsole (one-time 5 USD fee, needs a
   Google account).

Per release:

1. Developer console → the item → **Package** → upload the chrome zip.
2. Fill the listing: name "LingoChunk Recorder", description, category
   (Education), screenshots (1280x800), icon (128px, already in the zip).
3. **Privacy tab matters most for review.** Declare:
   - Single purpose: record audio lessons and upload them to the user's
     LingoChunk account.
   - Permission justifications: `storage` (local recordings + settings),
     `identity` (one-click account connection), host permission
     `lingochunk.com` (uploading to the user's account).
   - Data usage: audio is user-initiated content uploaded to the user's own
     account; no analytics, no third parties, nothing sold.
4. Submit for review. Extensions using microphone + identity typically take a
   few days; answer reviewer questions by pointing at the (unminified) source.

## Firefox Add-ons (AMO)

One-time setup:

1. Create an account at https://addons.mozilla.org and add the add-on. The
   gecko id is pinned in the manifest (`recorder@lingochunk.com`) and must
   never change between versions.

Per release:

1. https://addons.mozilla.org/developers/ → submit new version → upload the
   firefox zip.
2. AMO runs the same validator as `npm run lint:firefox`, so a clean local
   lint means a clean upload.
3. Source code: the shipped files ARE the source (no bundler), so no separate
   source submission is needed. If that ever changes, AMO requires the
   original source plus exact build instructions.
4. The manifest already declares `data_collection_permissions: none`
   (Mozilla's data-consent framework). Revisit this if the extension ever
   starts collecting anything.

Signed `.xpi` for self-distribution (GitHub releases) without listing on AMO:
use `web-ext sign --channel unlisted` with AMO API credentials.

## After both stores approve

- Attach both zips (and the signed `.xpi` if built) to the GitHub release.
- Update the README's install section to link the store listings.
