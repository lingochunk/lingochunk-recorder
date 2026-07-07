/**
 * Minimal background script with one job: restore the unsent-recordings
 * badge after a browser restart. Badge text does not survive restarts, and
 * without this the reminder would silently vanish until the user next opened
 * the popup or recorder. Everything else the extension does lives in its
 * pages; this stays dormant.
 */

import { ext } from './lib/env.js';
import { RecordingStore } from './lib/db.js';
import { showUnsentBadge } from './lib/badge.js';

async function refreshBadge() {
  try {
    const store = await RecordingStore.open();
    await showUnsentBadge(await store.listRecordings());
  } catch {
    // No recordings database yet — nothing to show.
  }
}

ext.runtime.onStartup.addListener(() => void refreshBadge());
ext.runtime.onInstalled.addListener(() => void refreshBadge());
