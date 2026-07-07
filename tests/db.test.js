import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RecordingStore } from '../src/lib/db.js';

const chunk = (text) => new Blob([text], { type: 'audio/webm' });

let store;

beforeEach(async () => {
  // A pristine IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
  store = await RecordingStore.open();
});

describe('RecordingStore', () => {
  it('creates a recording in `recording` state with metadata', async () => {
    const rec = await store.createRecording({ title: 'Lesson', learningLanguage: 'de' });
    const loaded = await store.getRecording(rec.id);
    expect(loaded.status).toBe('recording');
    expect(loaded.title).toBe('Lesson');
    expect(loaded.sizeBytes).toBe(0);
  });

  it('appends chunks and tracks running totals', async () => {
    const rec = await store.createRecording({});
    await store.appendChunk(rec.id, 0, chunk('aaaa'), { durationMs: 5000 });
    await store.appendChunk(rec.id, 1, chunk('bb'), { durationMs: 10000 });
    const loaded = await store.getRecording(rec.id);
    expect(loaded.sizeBytes).toBe(6);
    expect(loaded.chunkCount).toBe(2);
    expect(loaded.durationMs).toBe(10000);
  });

  it('assembles chunks back into one blob in seq order', async () => {
    const rec = await store.createRecording({});
    // Insert out of order; assembly must sort by seq.
    await store.appendChunk(rec.id, 1, chunk('world'));
    await store.appendChunk(rec.id, 0, chunk('hello '));
    const blob = await store.assembleBlob(rec.id);
    expect(await blob.text()).toBe('hello world');
    expect(blob.type).toBe('audio/webm');
  });

  it('does not mix chunks between recordings', async () => {
    const a = await store.createRecording({});
    const b = await store.createRecording({});
    await store.appendChunk(a.id, 0, chunk('AAA'));
    await store.appendChunk(b.id, 0, chunk('BBB'));
    expect(await (await store.assembleBlob(a.id)).text()).toBe('AAA');
    expect(await (await store.assembleBlob(b.id)).text()).toBe('BBB');
  });

  it('lists recordings newest first', async () => {
    const first = await store.createRecording({ createdAt: 1000 });
    const second = await store.createRecording({ createdAt: 2000 });
    const rows = await store.listRecordings();
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it('deletes a recording together with its chunks', async () => {
    const rec = await store.createRecording({});
    await store.appendChunk(rec.id, 0, chunk('x'));
    await store.deleteRecording(rec.id);
    expect(await store.getRecording(rec.id)).toBeUndefined();
    await expect(store.assembleBlob(rec.id)).rejects.toThrow(/No recording/);
  });

  it('recovers crash-interrupted rows: chunks kept → recorded, empty → failed', async () => {
    const withAudio = await store.createRecording({});
    await store.appendChunk(withAudio.id, 0, chunk('x'));
    const empty = await store.createRecording({});
    const uploading = await store.createRecording({});
    await store.appendChunk(uploading.id, 0, chunk('y'));
    await store.updateRecording(uploading.id, { status: 'uploading' });

    const recovered = await store.recoverInterrupted();
    expect(recovered).toBe(3);
    expect((await store.getRecording(withAudio.id)).status).toBe('recorded');
    expect((await store.getRecording(uploading.id)).status).toBe('recorded');
    const emptyRow = await store.getRecording(empty.id);
    expect(emptyRow.status).toBe('failed');
    expect(emptyRow.error).toMatch(/interrupted/);
  });
});
