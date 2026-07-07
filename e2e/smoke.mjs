#!/usr/bin/env node
/**
 * Real-browser smoke test: load dist/chrome into Chromium with a fake
 * microphone, record a few seconds, stop, and assert the recording is
 * persisted and listed as ready to upload.
 *
 * Playwright is not a dependency of this repo (it would drag a browser
 * download into every contributor install). Point PLAYWRIGHT_FROM at any file
 * inside a project that has playwright installed, e.g.:
 *
 *   PLAYWRIGHT_FROM=../lingochunk/demos/package.json node e2e/smoke.mjs
 */

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFrom = createRequire(
  process.env.PLAYWRIGHT_FROM ? resolve(process.env.PLAYWRIGHT_FROM) : import.meta.url,
);
const { chromium } = requireFrom('playwright');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist', 'chrome');
const userDataDir = mkdtempSync(join(tmpdir(), 'lc-recorder-smoke-'));

const fail = (message) => {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
};

const context = await chromium.launchPersistentContext(userDataDir, {
  // Extensions only load in Chromium's NEW headless; Playwright 1.49's
  // `headless: true` still means old headless, so pass the flag explicitly.
  headless: false,
  args: [
    '--headless=new',
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

// Fixed id, derived from the "key" in manifest/chrome.json (there is no
// background service worker to discover it from).
const extensionId = 'aajiecjlpfedafgdnecdkagiomidfdcf';

try {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/recorder.html`);
  if ((await page.title()) !== 'LingoChunk Recorder') fail('page title wrong');

  // Record ~6s so at least one 5s timeslice lands in IndexedDB mid-recording.
  await page.click('#record-btn');
  await page.waitForSelector('#record-btn.recording', { timeout: 5_000 });
  await page.waitForTimeout(6_500);

  const midRow = await page.evaluate(async () => {
    const { RecordingStore } = await import('./lib/db.js');
    const store = await RecordingStore.open();
    const [row] = await store.listRecordings();
    return row ? { status: row.status, sizeBytes: row.sizeBytes, chunkCount: row.chunkCount } : null;
  });
  if (!midRow) fail('no recording row while recording');
  if (midRow.status !== 'recording') fail(`mid-recording status ${midRow.status}`);
  if (midRow.chunkCount < 1) fail('no chunk persisted during recording (crash-safety broken)');

  await page.click('#record-btn');
  await page.waitForSelector('#record-btn:not(.recording)', { timeout: 10_000 });

  const pill = await page.textContent('#recordings .pill');
  if (pill !== 'Ready to upload') fail(`final pill "${pill}"`);

  const finalRow = await page.evaluate(async () => {
    const { RecordingStore } = await import('./lib/db.js');
    const store = await RecordingStore.open();
    const [row] = await store.listRecordings();
    const blob = await store.assembleBlob(row.id);
    return { status: row.status, blobSize: blob.size, durationMs: row.durationMs };
  });
  if (finalRow.status !== 'recorded') fail(`final status ${finalRow.status}`);
  if (finalRow.blobSize <= 0) fail('assembled blob is empty');
  if (finalRow.durationMs < 5_000) fail(`duration ${finalRow.durationMs}ms too short`);

  console.log(
    `SMOKE OK: recorded ${finalRow.durationMs}ms, ${finalRow.blobSize} bytes across ${midRow.chunkCount}+ chunks`,
  );

  // Scenario 2: the mic+tab MIX path. tabCapture needs a real toolbar click,
  // which automation cannot fake, so exercise RecordingSession's mixing with
  // a synthetic Web Audio stream standing in for the captured tab.
  const mix = await page.evaluate(async () => {
    const { RecordingStore } = await import('./lib/db.js');
    const { RecordingSession } = await import('./lib/recording.js');
    const store = await RecordingStore.open();
    const session = new RecordingSession(store);

    const ctx = new AudioContext();
    await ctx.resume();
    const osc = ctx.createOscillator();
    const synthTab = ctx.createMediaStreamDestination();
    osc.connect(synthTab);
    osc.start();

    const rec = await session.start({ title: 'mix-smoke' }, { tabStream: synthTab.stream });
    await new Promise((resolve) => setTimeout(resolve, 6_500));
    const row = await session.stop();
    const blob = await store.assembleBlob(rec.id);
    osc.stop();
    await ctx.close();
    return { status: row.status, source: row.source, blobSize: blob.size, durationMs: row.durationMs };
  });
  if (mix.status !== 'recorded') fail(`mix status ${mix.status}`);
  if (mix.source !== 'mic+tab') fail(`mix source ${mix.source}`);
  if (mix.blobSize <= 0) fail('mix blob is empty');
  console.log(`SMOKE OK (mix): recorded ${mix.durationMs}ms, ${mix.blobSize} bytes from mic + synthetic tab`);

  // Scenario 3: the popup remote control. The popup page is opened as a
  // normal tab (Playwright cannot click the toolbar), and drives the
  // recorder page via runtime messaging: start, badge state, stop, saved.
  // Mic permission for the extension origin was implicitly granted by
  // scenario 1's getUserMedia under --use-fake-ui-for-media-stream.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await popup.waitForSelector('#state-idle:not([hidden])', { timeout: 5_000 });
  await popup.click('#rec-mic-btn');
  await popup.waitForSelector('#state-recording:not([hidden])', { timeout: 10_000 });
  await popup.waitForTimeout(6_500);
  await popup.click('#stop-btn');
  await popup.waitForSelector('#state-saved:not([hidden])', { timeout: 10_000 });

  const remote = await page.evaluate(async () => {
    const { RecordingStore } = await import('./lib/db.js');
    const store = await RecordingStore.open();
    const [row] = await store.listRecordings();
    return { status: row.status, source: row.source, sizeBytes: row.sizeBytes };
  });
  if (remote.status !== 'recorded') fail(`popup-driven status ${remote.status}`);
  if (remote.source !== 'mic') fail(`popup-driven source ${remote.source}`);
  if (remote.sizeBytes <= 0) fail('popup-driven recording is empty');
  console.log(`SMOKE OK (popup): remote-controlled recording of ${remote.sizeBytes} bytes`);
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
