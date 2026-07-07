/**
 * Lesson-tab audio capture (Chrome only).
 *
 * Chrome's tabCapture rules shape the whole flow: an extension may only
 * capture a tab it has been "invoked" on, i.e. the user clicked the toolbar
 * icon while on that tab. So the background script ARMS the clicked tab
 * (stores its id), and at record time the recorder page asks tabCapture for
 * a stream id targeting the armed tab. If the user never clicked the icon on
 * a lesson tab, there is nothing to capture and the UI says so.
 *
 * Firefox has no tabCapture and getDisplayMedia there captures no audio, so
 * everything here no-ops behind tabCaptureAvailable().
 *
 * Functions accept the extension namespace as an injectable parameter so the
 * arming logic is unit-testable; production callers use the default.
 */

import { ext } from './env.js';

const KEY = 'lessonTab';

export function tabCaptureAvailable(e = ext) {
  return Boolean(e?.tabCapture?.getMediaStreamId);
}

/** storage.session (dies with the browser session — right lifetime for a tab
 *  id) when available, else storage.local. */
function storageArea(e = ext) {
  return e.storage.session ?? e.storage.local;
}

/** Remember the tab the user invoked us on, if it is a capturable web page.
 *  Returns true when armed. */
export async function armLessonTab(tab, e = ext) {
  if (!tab || tab.id === undefined || !/^https?:/.test(tab.url ?? '')) return false;
  await storageArea(e).set({
    [KEY]: { tabId: tab.id, title: tab.title ?? 'Lesson tab' },
  });
  return true;
}

/** The armed lesson tab, revalidated against the live tab list (returns null
 *  when nothing was armed or the tab has been closed). Title is refreshed so
 *  the UI shows where the tab navigated to. */
export async function getArmedLessonTab(e = ext) {
  const { [KEY]: armed } = await storageArea(e).get(KEY);
  if (!armed) return null;
  try {
    const tab = await e.tabs.get(armed.tabId);
    return { tabId: tab.id, title: tab.title ?? armed.title };
  } catch {
    return null;
  }
}

/**
 * Open an audio MediaStream of the armed tab. Must be called from the
 * recorder page (the consumer tab), in a user gesture, and only works if the
 * user clicked the extension icon on that tab since it last navigated —
 * otherwise Chrome rejects and the caller tells the user to click the icon
 * on the lesson tab again.
 */
export async function captureTabAudio(tabId, e = ext) {
  const consumer = await e.tabs.getCurrent();
  const streamId = await e.tabCapture.getMediaStreamId({
    targetTabId: tabId,
    consumerTabId: consumer?.id,
  });
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: false,
  });
}
