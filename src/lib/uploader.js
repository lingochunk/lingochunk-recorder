/**
 * Upload + processing-poll orchestration.
 *
 * Uploading never destroys local data: the recording stays in IndexedDB in
 * every state, and a failed upload just parks the row in `failed` with the
 * server's message, ready for Retry. The upload itself is retried a few times
 * with exponential backoff for transient failures (network blips, 5xx); a 4xx
 * is a permanent answer (bad token, quota, validation) and fails immediately.
 */

import { ApiError } from './api.js';

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when retrying could plausibly change the outcome. */
export function isTransient(error) {
  if (error instanceof ApiError) {
    // 429 asks us to slow down; 5xx is the server's problem. Everything else
    // in 4xx is a deterministic no.
    return error.status === 429 || error.status >= 500;
  }
  // TypeError from fetch = network failure; anything unknown: assume transient.
  return true;
}

/** Run `fn` with exponential backoff on transient errors. */
export async function withRetries(fn, { attempts = RETRY_ATTEMPTS, baseMs = RETRY_BASE_MS, sleeper = sleep } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      await sleeper(baseMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** File extension for a MediaRecorder mime type. */
export function filenameFor(recording) {
  const ext = recording.mimeType.includes('ogg') ? 'ogg' : 'webm';
  const stamp = new Date(recording.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `recording-${stamp}.${ext}`;
}

/**
 * Upload one recording end to end: assemble the blob from IndexedDB, POST it,
 * and move the row through uploading → processing (or failed). Returns the
 * updated row.
 */
export async function uploadRecording(store, api, recordingId) {
  const recording = await store.getRecording(recordingId);
  if (!recording) throw new Error(`No recording ${recordingId}`);

  await store.updateRecording(recordingId, { status: 'uploading', error: null });
  try {
    const blob = await store.assembleBlob(recordingId);
    if (blob.size === 0) throw new ApiError(400, 'This recording contains no audio.');
    const result = await withRetries(() =>
      api.createSubmission({
        blob,
        filename: filenameFor(recording),
        learningLanguage: recording.learningLanguage,
        nativeLanguage: recording.nativeLanguage,
        level: recording.level,
        title: recording.title,
        collection: recording.collection,
        notify: Boolean(recording.notify),
      }),
    );
    return await store.updateRecording(recordingId, {
      status: 'processing',
      submissionId: result.submission_id,
      jobId: result.job_id,
      error: null,
    });
  } catch (error) {
    await store.updateRecording(recordingId, {
      status: 'failed',
      error: error.message ?? String(error),
    });
    throw error;
  }
}

/**
 * Poll a submission's processing status until it is terminal. Calls
 * `onUpdate(statusBody)` after every poll; resolves with the final body.
 * The returned controller's stop() abandons the loop (e.g. page closing).
 */
export function pollProcessing(api, submissionId, { intervalMs = 5000, onUpdate, sleeper = sleep } = {}) {
  let stopped = false;
  const promise = (async () => {
    for (;;) {
      if (stopped) return null;
      let body;
      try {
        body = await api.submissionStatus(submissionId);
      } catch (error) {
        if (!isTransient(error)) throw error;
        await sleeper(intervalMs);
        continue;
      }
      onUpdate?.(body);
      if (body.status === 'ready' || body.status === 'failed') return body;
      await sleeper(intervalMs);
    }
  })();
  return { promise, stop: () => { stopped = true; } };
}
