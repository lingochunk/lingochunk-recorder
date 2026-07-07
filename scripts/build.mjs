#!/usr/bin/env node
/**
 * Assemble the per-browser extension directories.
 *
 * There is deliberately no bundler and no minification: the shipped files are
 * the files in src/, byte for byte, plus the browser-specific manifest. That
 * keeps store review (AMO in particular) trivial — what reviewers read is what
 * runs — and keeps the dev loop to "npm run build, reload the extension".
 *
 *   node scripts/build.mjs            # dist/chrome + dist/firefox
 *   node scripts/build.mjs --zip      # also writes dist/*.zip (for store upload)
 */

import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const wantZip = process.argv.includes('--zip');

rmSync(dist, { recursive: true, force: true });

for (const browser of ['chrome', 'firefox']) {
  const out = join(dist, browser);
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });
  copyFileSync(join(root, 'manifest', `${browser}.json`), join(out, 'manifest.json'));
  console.log(`built dist/${browser}`);

  if (wantZip) {
    // Stage a store copy: the Chrome Web Store REJECTS manifests containing
    // "key" (it is a dev-only id pin for the unpacked build / e2e tests), so
    // strip it from the uploaded package only.
    const stage = join(dist, `${browser}-store`);
    cpSync(out, stage, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
    delete manifest.key;
    writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    // Zip CONTENTS of the dir (manifest.json at archive root), as stores require.
    execFileSync('zip', ['-r', '-q', join(dist, `lingochunk-recorder-${browser}.zip`), '.'], {
      cwd: stage,
    });
    rmSync(stage, { recursive: true, force: true });
    console.log(`zipped dist/lingochunk-recorder-${browser}.zip`);
  }
}

if (!existsSync(join(dist, 'chrome', 'manifest.json'))) {
  console.error('build produced no manifest — something is wrong');
  process.exit(1);
}
