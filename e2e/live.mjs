#!/usr/bin/env node
/**
 * Full live end-to-end test against a real LingoChunk server: load the built
 * extension into Chromium, connect an account, record real speech through a
 * fake microphone, upload, and wait for the pipeline to finish processing.
 *
 * Requires an account on the target server. Configuration via env:
 *   LC_E2E_EMAIL / LC_E2E_PASSWORD  account credentials (required)
 *   LC_E2E_BASE                     server, default https://lingochunk.com
 *   LC_E2E_AUDIO                    absolute path to a .wav of real speech,
 *                                   played as the fake mic input (required)
 *   LC_E2E_AUTH                     'popup' (default: drive the real
 *                                   launchWebAuthFlow window) or 'token'
 *                                   (mint a token via the API and seed it)
 *   LC_E2E_KEEP                     '1' to skip deleting the test submission
 *   PLAYWRIGHT_FROM                 path into a project with playwright
 *
 * Example:
 *   LC_E2E_EMAIL=... LC_E2E_PASSWORD=... \
 *   LC_E2E_AUDIO=/tmp/german.wav \
 *   PLAYWRIGHT_FROM=../lingochunk/demos/package.json node e2e/live.mjs
 */

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFrom = createRequire(
  process.env.PLAYWRIGHT_FROM ? resolve(process.env.PLAYWRIGHT_FROM) : import.meta.url,
);
const { chromium } = requireFrom('playwright');

const BASE = (process.env.LC_E2E_BASE ?? 'https://lingochunk.com').replace(/\/+$/, '');
const EMAIL = process.env.LC_E2E_EMAIL;
const PASSWORD = process.env.LC_E2E_PASSWORD;
const AUDIO = process.env.LC_E2E_AUDIO;
const AUTH_MODE = process.env.LC_E2E_AUTH ?? 'popup';
const RECORD_SECONDS = 15;
const PROCESSING_TIMEOUT_MS = 8 * 60 * 1000;

if (!EMAIL || !PASSWORD) throw new Error('Set LC_E2E_EMAIL and LC_E2E_PASSWORD');
if (!AUDIO || !existsSync(AUDIO)) throw new Error('Set LC_E2E_AUDIO to an existing .wav file');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist', 'chrome');
const userDataDir = mkdtempSync(join(tmpdir(), 'lc-recorder-live-'));
const log = (msg) => console.log(`[live-e2e] ${msg}`);
const fail = (msg) => {
  console.error(`LIVE E2E FAIL: ${msg}`);
  process.exit(1);
};

/** Cookie-session login used for token-mode auth and for cleanup. */
async function apiLogin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return cookie;
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    '--headless=new',
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${AUDIO}`,
  ],
});

let submissionId = null;
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/recorder.html`);

  // --- connect ---------------------------------------------------------
  await page.fill('#api-base', BASE);

  if (AUTH_MODE === 'popup') {
    log('connecting via the real launchWebAuthFlow popup…');
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
    await page.click('#connect-btn');
    const popup = await popupPromise;
    // The SPA renders after load; wait for whichever screen appears — the
    // login form (fresh profile: /connect bounces to /login) or the consent
    // screen directly.
    await popup.waitForSelector('#email, #password, button:text("Authorise")', {
      timeout: 20_000,
    });
    if (await popup.locator('#email').count()) {
      log(`popup at ${popup.url()} — logging in`);
      await popup.fill('#email', EMAIL);
      await popup.fill('#password', PASSWORD);
      await popup.click('button[type=submit]');
    }
    await popup.getByRole('button', { name: 'Authorise' }).click({ timeout: 30_000 });
  } else {
    log('connecting via API-minted token…');
    const cookie = await apiLogin();
    const res = await fetch(`${BASE}/api/tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Recorder live e2e', scopes: ['submissions:write'] }),
    });
    if (!res.ok) throw new Error(`token mint failed: HTTP ${res.status}`);
    const { token } = await res.json();
    await page.evaluate(
      ([apiBase, tok]) => chrome.storage.local.set({ apiBase, token: tok }),
      [BASE, token],
    );
    await page.reload();
  }

  await page.waitForFunction(
    () => document.querySelector('#conn-status')?.textContent === 'Connected',
    { timeout: 20_000 },
  );
  log('connected');

  // --- record ----------------------------------------------------------
  await page.fill('#rec-title', `Live e2e ${new Date().toISOString().slice(0, 16)}`);
  await page.selectOption('#learning-lang', 'de');
  await page.selectOption('#native-lang', 'en');
  await page.click('#record-btn');
  await page.waitForSelector('#record-btn.recording', { timeout: 5_000 });
  log(`recording ${RECORD_SECONDS}s of speech from the fake mic…`);
  await page.waitForTimeout(RECORD_SECONDS * 1000);
  await page.click('#record-btn');
  await page.waitForSelector('#record-btn:not(.recording)', { timeout: 10_000 });

  const pill = await page.textContent('#recordings .pill');
  if (pill !== 'Ready to upload') fail(`after stop, pill is "${pill}"`);
  log('recorded and stored locally');

  // --- upload + process ------------------------------------------------
  await page.getByRole('button', { name: 'Upload' }).click();
  await page.waitForFunction(
    () => {
      const t = document.querySelector('#recordings .pill')?.textContent;
      return t === 'Processing…' || t === 'In your library' || t === 'Failed';
    },
    { timeout: 60_000 },
  );
  const afterUpload = await page.evaluate(async () => {
    const { RecordingStore } = await import('./lib/db.js');
    const store = await RecordingStore.open();
    const [row] = await store.listRecordings();
    return { status: row.status, error: row.error, submissionId: row.submissionId };
  });
  if (afterUpload.status === 'failed' || !afterUpload.submissionId) {
    fail(`upload failed: ${afterUpload.error ?? 'no submissionId recorded'}`);
  }
  submissionId = afterUpload.submissionId;
  log(`uploaded, submission ${submissionId}; waiting for the pipeline…`);

  await page.waitForFunction(
    () => {
      const t = document.querySelector('#recordings .pill')?.textContent;
      return t === 'In your library' || t === 'Failed';
    },
    { timeout: PROCESSING_TIMEOUT_MS, polling: 2_000 },
  );
  const finalPill = await page.textContent('#recordings .pill');
  if (finalPill !== 'In your library') {
    const error = await page.evaluate(async () => {
      const { RecordingStore } = await import('./lib/db.js');
      const store = await RecordingStore.open();
      const [row] = await store.listRecordings();
      return row.error;
    });
    fail(`processing ended as "${finalPill}": ${error}`);
  }

  console.log(`LIVE E2E OK: recorded, uploaded and processed submission ${submissionId} on ${BASE}`);
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });

  // Clean up the test submission and the tokens this test minted (popup mode
  // creates a "LingoChunk Recorder" token per run; they would pile up against
  // the account's active-token cap) unless asked to keep everything.
  if (process.env.LC_E2E_KEEP !== '1') {
    try {
      const cookie = await apiLogin();
      if (submissionId) {
        const res = await fetch(`${BASE}/api/submissions/${submissionId}`, {
          method: 'DELETE',
          headers: { cookie },
        });
        log(`cleanup: DELETE submission ${submissionId} → HTTP ${res.status}`);
      }
      const tokens = await (await fetch(`${BASE}/api/tokens`, { headers: { cookie } })).json();
      for (const token of tokens) {
        if (token.name === 'LingoChunk Recorder' && !token.revoked_at) {
          const res = await fetch(`${BASE}/api/tokens/${token.id}`, {
            method: 'DELETE',
            headers: { cookie },
          });
          log(`cleanup: revoked test token ${token.token_prefix}… → HTTP ${res.status}`);
        }
      }
    } catch (error) {
      log(`cleanup failed (tidy the account manually): ${error.message}`);
    }
  }
}
