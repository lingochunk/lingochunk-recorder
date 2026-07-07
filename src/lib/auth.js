/**
 * One-click connect to LingoChunk.
 *
 * Opens the app's /connect authorise page in the browser's identity popup
 * (identity.launchWebAuthFlow). The user approves there; the page mints a
 * personal access token scoped to submissions:write and redirects to the
 * browser-reserved extension redirect URL with the token in the URL FRAGMENT
 * (never sent to any server). We parse it out of the final URL.
 */

import { ext } from './env.js';

export const REQUIRED_SCOPES = 'submissions:write';
export const CLIENT_NAME = 'LingoChunk Recorder';

/** The /connect URL for a given API base and redirect target. Exported for
 *  tests and for the manual-mode help text. */
export function buildConnectUrl(apiBase, redirectUri) {
  const url = new URL('/connect', apiBase);
  url.searchParams.set('scopes', REQUIRED_SCOPES);
  url.searchParams.set('name', CLIENT_NAME);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
}

/**
 * Extract the token from the redirect URL's fragment.
 * Returns the raw token string, or throws with a user-facing message.
 */
export function parseTokenFromRedirect(finalUrl) {
  const hash = new URL(finalUrl).hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const error = params.get('error');
  if (error === 'access_denied') {
    throw new Error('You declined the connection request.');
  }
  if (error) {
    throw new Error(`Connection failed: ${error}`);
  }
  const token = params.get('token');
  if (!token || !token.startsWith('lcp_')) {
    throw new Error('No token returned. Please try connecting again.');
  }
  return token;
}

/** Run the interactive connect flow and return the raw token. */
export async function connect(apiBase) {
  const redirectUri = ext.identity.getRedirectURL();
  const finalUrl = await ext.identity.launchWebAuthFlow({
    url: buildConnectUrl(apiBase, redirectUri),
    interactive: true,
  });
  if (!finalUrl) {
    throw new Error('Connection window was closed before finishing.');
  }
  return parseTokenFromRedirect(finalUrl);
}
