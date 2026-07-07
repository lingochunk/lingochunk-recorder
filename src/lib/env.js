/**
 * The WebExtensions API namespace, whichever this browser provides.
 *
 * Firefox exposes the promise-based `browser`; Chrome MV3 exposes `chrome`,
 * whose APIs also return promises when the callback is omitted. Every API this
 * extension uses (storage, identity, tabs, action, permissions) is
 * promise-complete in both, so no polyfill is needed.
 */
export const ext = globalThis.browser ?? globalThis.chrome;

/** True when running in Firefox (used only for help text, never for logic). */
export const isFirefox = typeof globalThis.browser !== 'undefined';
