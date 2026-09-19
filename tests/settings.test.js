import { afterEach, describe, expect, it, vi } from 'vitest';

/** settings.js reads the extension namespace at import time, so the fake
 *  storage is installed before the module is loaded, fresh for each test. */
async function loadSettings(stored = {}) {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => stored, set: async () => {}, remove: async () => {} } },
  });
  return import('../src/lib/settings.js');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSettings', () => {
  it('asks the server to identify the language until the user picks one', async () => {
    const { getSettings } = await loadSettings();
    const settings = await getSettings();
    expect(settings.learningLanguage).toBe('auto');
    expect(settings.nativeLanguage).toBe('en');
  });

  it('keeps a language the user picked', async () => {
    const { getSettings } = await loadSettings({ learningLanguage: 'de' });
    expect((await getSettings()).learningLanguage).toBe('de');
  });
});
