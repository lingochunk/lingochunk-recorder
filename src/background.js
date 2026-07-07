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
import { armLessonTab, tabCaptureAvailable } from './lib/tabaudio.js';

const RECORDER_PATH = 'src/recorder.html';

ext.action.onClicked.addListener(async (clickedTab) => {
  const url = ext.runtime.getURL(RECORDER_PATH);

  // Clicking the icon on a web page ARMS that tab for capture (Chrome grants
  // tab capture only for tabs the extension was invoked on), so "record my
  // online lesson" is: open the lesson tab, click the icon, press record.
  if (tabCaptureAvailable() && clickedTab?.url !== url) {
    await armLessonTab(clickedTab);
  }

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
