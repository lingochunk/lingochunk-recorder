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
import { AUTO_LANGUAGE } from './languages.js';

export const DEFAULT_API_BASE = 'https://lingochunk.com';

const DEFAULTS = {
  apiBase: DEFAULT_API_BASE,
  token: null,
  // Identification by default: a first-run user recording a tab in some
  // language was filed under whatever sat here (LINGOCHUNK-79). The server
  // decides from the recording; picking a language in the recorder is still
  // one click away and stays sticky.
  learningLanguage: AUTO_LANGUAGE,
  nativeLanguage: 'en',
  level: 'A2',
  collection: '',
  micDeviceId: '',
  // Completion email is OPT-IN: off until the user ticks it, then sticky.
  notifyDefault: false,
  // Auto-stop preset in minutes (0 = record until stopped) and whether a
  // finished recording is sent to LingoChunk without asking. Both sticky.
  autoStopMinutes: 0,
  autoSend: false,
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
