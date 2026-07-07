import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/lib/api.js';

const ok = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('ApiClient', () => {
  it('sends the Bearer token and strips trailing slashes from the base', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ collections: [] }));
    const client = new ApiClient('https://lingochunk.com///', 'lcp_t', fetchMock);
    await client.listCollections();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://lingochunk.com/api/v1/collections');
    expect(init.headers.Authorization).toBe('Bearer lcp_t');
  });

  it('posts the recording as multipart form data with all fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ submission_id: 's1', job_id: 'j1', status: 'queued' }), {
        status: 201,
      }),
    );
    const client = new ApiClient('https://lingochunk.com', 'lcp_t', fetchMock);
    const result = await client.createSubmission({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      filename: 'rec.webm',
      learningLanguage: 'de',
      nativeLanguage: 'en',
      level: 'B1',
      title: 'Lesson',
      collection: 'my-lessons',
    });
    expect(result.submission_id).toBe('s1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://lingochunk.com/api/v1/submissions');
    expect(init.method).toBe('POST');
    const form = init.body;
    expect(form.get('learning_language')).toBe('de');
    expect(form.get('native_language')).toBe('en');
    expect(form.get('level')).toBe('B1');
    expect(form.get('title')).toBe('Lesson');
    expect(form.get('collection')).toBe('my-lessons');
    expect(form.get('audio').name).toBe('rec.webm');
  });

  it('omits empty optional fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ submission_id: 's', job_id: 'j', status: 'queued' }));
    const client = new ApiClient('https://lingochunk.com', 'lcp_t', fetchMock);
    await client.createSubmission({
      blob: new Blob(['a']),
      filename: 'r.webm',
      learningLanguage: 'de',
      nativeLanguage: 'en',
      level: 'A2',
      title: '',
      collection: '',
    });
    const form = fetchMock.mock.calls[0][1].body;
    expect(form.has('title')).toBe(false);
    expect(form.has('collection')).toBe(false);
  });

  it('surfaces the server detail and code on errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Daily submission limit reached (20).', code: 'quota' }), {
        status: 429,
      }),
    );
    const client = new ApiClient('https://lingochunk.com', 'lcp_t', fetchMock);
    const error = await client.listCollections().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe('Daily submission limit reached (20).');
    expect(error.code).toBe('quota');
  });

  it('falls back to a generic message on a non-JSON error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    const client = new ApiClient('https://lingochunk.com', 'lcp_t', fetchMock);
    const error = await client.submissionStatus('x').catch((e) => e);
    expect(error.message).toBe('Request failed (HTTP 502)');
  });

  it('builds the in-app submission URL', () => {
    const client = new ApiClient('https://lingochunk.com', 'lcp_t');
    expect(client.submissionUrl('abc')).toBe('https://lingochunk.com/submissions/abc/listen');
  });
});
