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
    this.tabStream = null;
    this.audioContext = null;
    this.recording = null;
    this.startedAt = 0;
    this.seq = 0;
    this.writeChain = Promise.resolve();
    this.onerror = null;
    // Fired when an external source (the captured lesson tab) ends mid-take,
    // so the UI can stop the recording gracefully instead of taping silence.
    this.onsourceended = null;
  }

  get active() {
    return this.recorder !== null && this.recorder.state !== 'inactive';
  }

  get elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /**
   * Start recording into a fresh recording row.
   *
   * Sources: the microphone (default), a `tabStream` (captured lesson-tab
   * audio, see tabaudio.js), or both mixed into one track via the Web Audio
   * API. Tab audio is always played back to the speakers — capturing a tab
   * MUTES it for the user, and the learner still needs to hear the teacher.
   * The microphone is never played back (feedback loop). With `mic: false`
   * the microphone is not even requested, so tab-only recording needs no mic
   * permission at all.
   */
  async start(meta, { micDeviceId = '', tabStream = null, mic = true } = {}) {
    if (this.active) throw new Error('Already recording');
    if (!mic && !tabStream) throw new Error('No audio source selected');
    const mimeType = pickMimeType();

    this.stream = mic
      ? await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        })
      : null;

    let recordStream = this.stream;
    if (tabStream) {
      this.tabStream = tabStream;
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      const mix = this.audioContext.createMediaStreamDestination();
      if (this.stream) {
        this.audioContext.createMediaStreamSource(this.stream).connect(mix);
      }
      const tabSource = this.audioContext.createMediaStreamSource(tabStream);
      tabSource.connect(mix);
      tabSource.connect(this.audioContext.destination);
      recordStream = mix.stream;
      tabStream
        .getAudioTracks()[0]
        ?.addEventListener('ended', () => this.onsourceended?.());
    }

    this.recording = await this.store.createRecording({
      ...meta,
      mimeType,
      source: tabStream ? (mic ? 'mic+tab' : 'tab') : 'mic',
    });
    this.recorder = new MediaRecorder(recordStream, { mimeType });
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
    this.tabStream?.getTracks().forEach((track) => track.stop());
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // Already closed — nothing to release.
      }
    }
    const row = await this.store.updateRecording(this.recording.id, {
      status: 'recorded',
      durationMs: this.elapsedMs,
    });

    this.recorder = null;
    this.stream = null;
    this.tabStream = null;
    this.audioContext = null;
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
