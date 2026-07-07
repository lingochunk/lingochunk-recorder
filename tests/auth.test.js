import { describe, expect, it } from 'vitest';
import { buildConnectUrl, parseTokenFromRedirect } from '../src/lib/auth.js';

const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

describe('buildConnectUrl', () => {
  it('points at /connect with scopes, name and redirect_uri', () => {
    const url = new URL(buildConnectUrl('https://lingochunk.com', REDIRECT));
    expect(url.pathname).toBe('/connect');
    expect(url.searchParams.get('scopes')).toBe('submissions:write');
    expect(url.searchParams.get('name')).toBe('LingoChunk Recorder');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
  });

  it('works with a custom (self-hosted) base', () => {
    const url = new URL(buildConnectUrl('http://localhost:8000', REDIRECT));
    expect(url.origin).toBe('http://localhost:8000');
  });
});

describe('parseTokenFromRedirect', () => {
  it('extracts the token from the fragment', () => {
    expect(parseTokenFromRedirect(`${REDIRECT}#token=lcp_abc123`)).toBe('lcp_abc123');
  });

  it('URL-decodes the token', () => {
    expect(parseTokenFromRedirect(`${REDIRECT}#token=lcp_a%2Bb`)).toBe('lcp_a+b');
  });

  it('reports the user declining', () => {
    expect(() => parseTokenFromRedirect(`${REDIRECT}#error=access_denied`)).toThrow(
      /declined/,
    );
  });

  it('rejects a missing or malformed token', () => {
    expect(() => parseTokenFromRedirect(REDIRECT)).toThrow(/No token/);
    expect(() => parseTokenFromRedirect(`${REDIRECT}#token=notours`)).toThrow(/No token/);
  });
});
