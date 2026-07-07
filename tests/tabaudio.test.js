import { describe, expect, it } from 'vitest';
import {
  armLessonTab,
  getArmedLessonTab,
  tabCaptureAvailable,
} from '../src/lib/tabaudio.js';

/** Minimal fake of the extension namespace: one storage area + a tab list. */
function fakeExt({ tabs = {}, hasSession = true, hasTabCapture = true } = {}) {
  const stored = {};
  const area = {
    set: async (obj) => Object.assign(stored, obj),
    get: async (key) => ({ [key]: stored[key] }),
  };
  return {
    _stored: stored,
    storage: hasSession ? { session: area } : { local: area },
    tabs: {
      get: async (id) => {
        if (tabs[id]) return tabs[id];
        throw new Error('No tab with id');
      },
    },
    tabCapture: hasTabCapture ? { getMediaStreamId: async () => 'sid' } : undefined,
  };
}

describe('tabCaptureAvailable', () => {
  it('is true only when the tabCapture API exists (Chrome, not Firefox)', () => {
    expect(tabCaptureAvailable(fakeExt())).toBe(true);
    expect(tabCaptureAvailable(fakeExt({ hasTabCapture: false }))).toBe(false);
  });
});

describe('armLessonTab', () => {
  it('arms a normal web page tab', async () => {
    const e = fakeExt();
    const armed = await armLessonTab({ id: 7, url: 'https://meet.example/x', title: 'Lesson' }, e);
    expect(armed).toBe(true);
    expect(e._stored.lessonTab).toEqual({ tabId: 7, title: 'Lesson' });
  });

  it('refuses non-web pages (chrome://, about:, extension pages)', async () => {
    const e = fakeExt();
    expect(await armLessonTab({ id: 1, url: 'chrome://extensions' }, e)).toBe(false);
    expect(await armLessonTab({ id: 2, url: 'about:blank' }, e)).toBe(false);
    expect(await armLessonTab({ id: 3, url: 'chrome-extension://abc/x.html' }, e)).toBe(false);
    expect(e._stored.lessonTab).toBeUndefined();
  });

  it('arms a tab whose url is hidden from the extension', async () => {
    // Without broad tab permissions Chrome may omit tab.url; the deliberate
    // icon click still means "this tab", so arming must not be refused.
    const e = fakeExt();
    expect(await armLessonTab({ id: 4, title: 'Hidden url tab' }, e)).toBe(true);
    expect(e._stored.lessonTab).toEqual({ tabId: 4, title: 'Hidden url tab' });
  });

  it('falls back to storage.local when storage.session is unavailable', async () => {
    const e = fakeExt({ hasSession: false });
    await armLessonTab({ id: 9, url: 'https://x.example/', title: 't' }, e);
    expect(e._stored.lessonTab.tabId).toBe(9);
  });
});

describe('getArmedLessonTab', () => {
  it('returns the armed tab with a freshly resolved title', async () => {
    const e = fakeExt({ tabs: { 7: { id: 7, title: 'Now on Zoom' } } });
    await armLessonTab({ id: 7, url: 'https://zoom.example/j', title: 'Old title' }, e);
    expect(await getArmedLessonTab(e)).toEqual({ tabId: 7, title: 'Now on Zoom' });
  });

  it('returns null when nothing was armed', async () => {
    expect(await getArmedLessonTab(fakeExt())).toBeNull();
  });

  it('returns null when the armed tab has been closed', async () => {
    const e = fakeExt({ tabs: {} });
    await armLessonTab({ id: 7, url: 'https://zoom.example/j', title: 't' }, e);
    expect(await getArmedLessonTab(e)).toBeNull();
  });
});
