/**
 * Extension settings in browser.storage.local.
 *
 * The access token lives here too. storage.local is per-extension, not
 * web-readable, and the token is deliberately long-lived: it is scoped to
 * submissions:write only and revocable any time from LingoChunk Settings, so
 * a fresh login per recording session would cost usability without buying
 * meaningful safety.
 */

import { ext } from './env.js';

export const DEFAULT_API_BASE = 'https://lingochunk.com';

const DEFAULTS = {
  apiBase: DEFAULT_API_BASE,
  token: null,
  learningLanguage: 'de',
  nativeLanguage: 'en',
  level: 'A2',
  collection: '',
  micDeviceId: '',
  // Completion email is OPT-IN: off until the user ticks it, then sticky.
  notifyDefault: false,
};

export async function getSettings() {
  const stored = await ext.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await ext.storage.local.set(patch);
}

export async function clearToken() {
  await ext.storage.local.remove('token');
}

/**
 * Make sure we may call `apiBase` from extension pages.
 *
 * Chrome auto-grants the manifest's lingochunk.com host permission; Firefox
 * MV3 treats host permissions as opt-in, and any custom (self-hosted) base is
 * opt-in everywhere. Must be called from a user gesture (we call it from the
 * Connect / Save buttons).
 */
export async function ensureOriginPermission(apiBase) {
  const origin = `${new URL(apiBase).origin}/*`;
  const has = await ext.permissions.contains({ origins: [origin] });
  if (has) return true;
  return ext.permissions.request({ origins: [origin] });
}
