/**
 * Crash-safe local recording store (IndexedDB, no dependencies).
 *
 * The design goal is that closing the tab, crashing the browser, or losing
 * power mid-lesson loses AT MOST the last few seconds: MediaRecorder hands us
 * a chunk every few seconds and each chunk is written to IndexedDB the moment
 * it arrives. Nothing touches the network until the user uploads.
 *
 * Two stores:
 *   recordings — one row per recording: metadata + lifecycle status
 *                (recording → recorded → uploading → processing → uploaded,
 *                 or failed at any point)
 *   chunks     — the audio itself, keyed [recordingId, seq] so a recording's
 *                chunks read back in order.
 */

const DB_NAME = 'lingochunk-recorder';
const DB_VERSION = 1;

/** Wrap an IDBRequest into a promise. */
function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Wait for a transaction to fully commit (durability point for chunks). */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export function openDb() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('recordings')) {
      db.createObjectStore('recordings', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('chunks')) {
      const chunks = db.createObjectStore('chunks', { keyPath: ['recordingId', 'seq'] });
      chunks.createIndex('byRecording', 'recordingId');
    }
  };
  return req(request);
}

export class RecordingStore {
  constructor(db) {
    this.db = db;
  }

  static async open() {
    return new RecordingStore(await openDb());
  }

  /** Create a recording row in `recording` state and return it. */
  async createRecording(meta) {
    const recording = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: 'recording',
      mimeType: 'audio/webm',
      sizeBytes: 0,
      durationMs: 0,
      chunkCount: 0,
      title: '',
      submissionId: null,
      jobId: null,
      error: null,
      ...meta,
    };
    const tx = this.db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').add(recording);
    await done(tx);
    return recording;
  }

  /** Append one audio chunk and update the row's running totals atomically. */
  async appendChunk(recordingId, seq, blob, { durationMs } = {}) {
    const tx = this.db.transaction(['chunks', 'recordings'], 'readwrite');
    tx.objectStore('chunks').add({ recordingId, seq, blob });
    const recordings = tx.objectStore('recordings');
    const row = await req(recordings.get(recordingId));
    if (row) {
      row.sizeBytes += blob.size;
      row.chunkCount = Math.max(row.chunkCount, seq + 1);
      if (durationMs !== undefined) row.durationMs = durationMs;
      recordings.put(row);
    }
    await done(tx);
  }

  async updateRecording(recordingId, patch) {
    const tx = this.db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    const row = await req(store.get(recordingId));
    if (!row) throw new Error(`No recording ${recordingId}`);
    Object.assign(row, patch);
    store.put(row);
    await done(tx);
    return row;
  }

  async getRecording(recordingId) {
    const tx = this.db.transaction('recordings');
    return req(tx.objectStore('recordings').get(recordingId));
  }

  /** All recordings, newest first. */
  async listRecordings() {
    const tx = this.db.transaction('recordings');
    const all = await req(tx.objectStore('recordings').getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Reassemble the full audio blob from the stored chunks, in order. */
  async assembleBlob(recordingId) {
    const row = await this.getRecording(recordingId);
    if (!row) throw new Error(`No recording ${recordingId}`);
    const tx = this.db.transaction('chunks');
    const chunks = await req(
      tx.objectStore('chunks').index('byRecording').getAll(recordingId),
    );
    chunks.sort((a, b) => a.seq - b.seq);
    return new Blob(
      chunks.map((c) => c.blob),
      { type: row.mimeType },
    );
  }

  /** Delete a recording and every chunk it owns. */
  async deleteRecording(recordingId) {
    const tx = this.db.transaction(['chunks', 'recordings'], 'readwrite');
    const index = tx.objectStore('chunks').index('byRecording');
    const keys = await req(index.getAllKeys(recordingId));
    for (const key of keys) tx.objectStore('chunks').delete(key);
    tx.objectStore('recordings').delete(recordingId);
    await done(tx);
  }

  /**
   * Recover rows stuck in a transient state by a crash: a row still marked
   * `recording` or `uploading` after a page load cannot actually be doing
   * either. Chunks are intact, so it becomes `recorded` (ready to upload).
   */
  async recoverInterrupted() {
    const rows = await this.listRecordings();
    const stuck = rows.filter((r) => r.status === 'recording' || r.status === 'uploading');
    for (const row of stuck) {
      await this.updateRecording(row.id, {
        status: row.chunkCount > 0 ? 'recorded' : 'failed',
        error: row.chunkCount > 0 ? null : 'Recording was interrupted before any audio was captured.',
      });
    }
    return stuck.length;
  }
}
