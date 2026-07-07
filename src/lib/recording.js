/**
 * MediaRecorder session wrapped around the crash-safe store.
 *
 * Chunks are flushed to IndexedDB every TIMESLICE_MS, so an interrupted
 * session (tab closed, browser crash) keeps everything already sliced. All
 * mic handling is here; the UI only sees start/stop/elapsed.
 */

const TIMESLICE_MS = 5000;

/** Best supported audio container for MediaRecorder in this browser. */
export function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (globalThis.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return 'audio/webm';
}

export class RecordingSession {
  constructor(store) {
    this.store = store;
    this.recorder = null;
    this.stream = null;
    this.recording = null;
    this.startedAt = 0;
    this.seq = 0;
    this.writeChain = Promise.resolve();
    this.onerror = null;
  }

  get active() {
    return this.recorder !== null && this.recorder.state !== 'inactive';
  }

  get elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /** Ask for the mic and start recording into a fresh recording row. */
  async start(meta, micDeviceId = '') {
    if (this.active) throw new Error('Already recording');
    const constraints = {
      audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const mimeType = pickMimeType();
    this.recording = await this.store.createRecording({ ...meta, mimeType });
    this.recorder = new MediaRecorder(this.stream, { mimeType });
    this.startedAt = Date.now();
    this.seq = 0;

    this.recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      const seq = this.seq;
      this.seq += 1;
      const elapsed = this.elapsedMs;
      // Serialise writes so chunks commit in order even if one is slow.
      this.writeChain = this.writeChain
        .then(() => this.store.appendChunk(this.recording.id, seq, event.data, { durationMs: elapsed }))
        .catch((error) => this.onerror?.(error));
    };
    this.recorder.onerror = (event) => this.onerror?.(event.error ?? new Error('Recording error'));

    this.recorder.start(TIMESLICE_MS);
    return this.recording;
  }

  /** Stop, flush the final chunk, release the mic, mark the row `recorded`. */
  async stop() {
    if (!this.recorder) return null;
    const recorder = this.recorder;
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    await this.writeChain; // every chunk durably in IndexedDB

    this.stream?.getTracks().forEach((track) => track.stop());
    const row = await this.store.updateRecording(this.recording.id, {
      status: 'recorded',
      durationMs: this.elapsedMs,
    });

    this.recorder = null;
    this.stream = null;
    this.startedAt = 0;
    return row;
  }
}

/** Microphones available to the picker (labels appear after first grant). */
export async function listMicrophones() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}
