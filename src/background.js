/**
 * Toolbar-click entry point: open the recorder page, or focus it if open.
 *
 * Recording cannot live in this background context (MV3 service workers are
 * killed after ~30s idle; Firefox event pages likewise suspend), so the whole
 * app is a regular extension tab that stays alive while the user records. One
 * tab only: a second click focuses the existing session instead of spawning a
 * competing recorder.
 */

import { ext } from './lib/env.js';

const RECORDER_PATH = 'src/recorder.html';

ext.action.onClicked.addListener(async () => {
  const url = ext.runtime.getURL(RECORDER_PATH);
  const existing = await ext.tabs.query({ url });
  if (existing.length > 0) {
    const tab = existing[0];
    await ext.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await ext.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await ext.tabs.create({ url });
});
