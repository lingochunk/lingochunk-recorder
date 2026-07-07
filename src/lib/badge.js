/**
 * Toolbar badge as ambient status.
 *
 * Two states, by priority: a red REC while a recording is running, else a
 * blue count of recordings sitting on this device that were never sent
 * ("recorded", or "failed" before reaching the server). The count is the
 * reminder Alex asked for: glance at the toolbar, see there's something you
 * meant to send. Refreshed by whoever is awake — the recorder page on every
 * list render, the popup on open, and the background script on browser
 * startup (badges do not survive a restart on their own).
 */

import { ext } from './env.js';

const RED = '#C53030';
const BLUE = '#2B6CB0';

/** Recordings that exist only on this device and still await a send. */
export function countUnsent(rows) {
  return rows.filter(
    (row) => row.status === 'recorded' || (row.status === 'failed' && !row.submissionId),
  ).length;
}

export async function showRecordingBadge() {
  try {
    await ext.action.setBadgeBackgroundColor({ color: RED });
    await ext.action.setBadgeText({ text: 'REC' });
  } catch {
    // Badge is decoration; never let it break recording.
  }
}

export async function showUnsentBadge(rows) {
  const unsent = countUnsent(rows);
  try {
    await ext.action.setBadgeBackgroundColor({ color: BLUE });
    await ext.action.setBadgeText({ text: unsent > 0 ? String(unsent) : '' });
  } catch {
    // Badge is decoration.
  }
}
