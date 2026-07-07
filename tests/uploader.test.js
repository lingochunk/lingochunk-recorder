import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ApiError } from '../src/lib/api.js';
import { RecordingStore } from '../src/lib/db.js';
import {
  filenameFor,
  isTransient,
  pollProcessing,
  uploadRecording,
  withRetries,
} from '../src/lib/uploader.js';

const noSleep = () => Promise.resolve();

describe('isTransient', () => {
  it('treats 429 and 5xx as transient, other 4xx as permanent', () => {
    expect(isTransient(new ApiError(429, 'slow down'))).toBe(true);
    expect(isTransient(new ApiError(503, 'paused'))).toBe(true);
    expect(isTransient(new ApiError(401, 'bad token'))).toBe(false);
    expect(isTransient(new ApiError(413, 'too large'))).toBe(false);
  });

  it('treats network errors as transient', () => {
    expect(isTransient(new TypeError('fetch failed'))).toBe(true);
  });
});

describe('withRetries', () => {
  it('retries transient failures with exponential backoff and succeeds', async () => {
    const delays = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'down'))
      .mockRejectedValueOnce(new TypeError('net'))
      .mockResolvedValue('ok');
    const result = await withRetries(fn, {
      attempts: 3,
      baseMs: 100,
      sleeper: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(result).toBe('ok');
    expect(delays).toEqual([100, 200]);
  });

  it('gives up immediately on permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(403, 'missing scope'));
    await expect(withRetries(fn, { sleeper: noSleep })).rejects.toThrow('missing scope');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError(503, 'still down'));
    await expect(withRetries(fn, { attempts: 3, sleeper: noSleep })).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('filenameFor', () => {
  it('derives extension from the mime type and stamps the date', () => {
    const rec = { mimeType: 'audio/webm;codecs=opus', createdAt: Date.UTC(2026, 6, 7, 10, 30, 0) };
    expect(filenameFor(rec)).toBe('recording-2026-07-07-10-30-00.webm');
    expect(filenameFor({ ...rec, mimeType: 'audio/ogg;codecs=opus' })).toMatch(/\.ogg$/);
  });
});

describe('uploadRecording', () => {
  let store;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    store = await RecordingStore.open();
  });

  async function seedRecording() {
    const rec = await store.createRecording({
      title: 'Lesson',
      learningLanguage: 'de',
      nativeLanguage: 'en',
      level: 'A2',
      collection: '',
    });
    await store.appendChunk(rec.id, 0, new Blob(['audio'], { type: 'audio/webm' }));
    await store.updateRecording(rec.id, { status: 'recorded' });
    return rec;
  }

  it('moves the row to processing with the server ids on success', async () => {
    const rec = await seedRecording();
    const api = {
      createSubmission: vi.fn().mockResolvedValue({ submission_id: 's1', job_id: 'j1', status: 'queued' }),
    };
    const row = await uploadRecording(store, api, rec.id);
    expect(row.status).toBe('processing');
    expect(row.submissionId).toBe('s1');
    expect(row.jobId).toBe('j1');
    const sent = api.createSubmission.mock.calls[0][0];
    expect(sent.learningLanguage).toBe('de');
    expect(sent.blob.size).toBeGreaterThan(0);
    expect(sent.notify).toBe(false);
  });

  it('passes the recording notify flag through to the API', async () => {
    const rec = await seedRecording();
    await store.updateRecording(rec.id, { notify: true });
    const api = {
      createSubmission: vi.fn().mockResolvedValue({ submission_id: 's1', job_id: 'j1', status: 'queued' }),
    };
    await uploadRecording(store, api, rec.id);
    expect(api.createSubmission.mock.calls[0][0].notify).toBe(true);
  });

  it('parks the row in failed with the server message on a permanent error', async () => {
    const rec = await seedRecording();
    const api = {
      createSubmission: vi.fn().mockRejectedValue(new ApiError(403, 'Please verify your email')),
    };
    await expect(uploadRecording(store, api, rec.id)).rejects.toThrow('verify');
    const row = await store.getRecording(rec.id);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('verify');
    // The audio is still there for a retry.
    expect((await store.assembleBlob(rec.id)).size).toBeGreaterThan(0);
  });
});

describe('pollProcessing', () => {
  it('polls until terminal and reports updates', async () => {
    const bodies = [
      { status: 'processing', progress: 40, step: 'transcription' },
      { status: 'ready', progress: 100 },
    ];
    const api = { submissionStatus: vi.fn(() => Promise.resolve(bodies.shift())) };
    const updates = [];
    const { promise } = pollProcessing(api, 's1', {
      sleeper: noSleep,
      onUpdate: (b) => updates.push(b.status),
    });
    const final = await promise;
    expect(final.status).toBe('ready');
    expect(updates).toEqual(['processing', 'ready']);
  });

  it('stops when asked', async () => {
    const api = { submissionStatus: vi.fn().mockResolvedValue({ status: 'processing' }) };
    let ticks = 0;
    const controller = pollProcessing(api, 's1', {
      sleeper: () => {
        ticks += 1;
        if (ticks > 2) controller.stop();
        return Promise.resolve();
      },
    });
    expect(await controller.promise).toBeNull();
  });
});
