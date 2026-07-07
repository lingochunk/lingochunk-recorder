/**
 * Recorder page controller: wires the UI to the lib modules.
 *
 * Principles:
 *  - Recording works fully offline and without a connected account; only
 *    Upload needs the token. Record first, connect later.
 *  - All user-supplied strings reach the DOM via textContent, never innerHTML.
 *  - A row in `processing` state resumes its status polling on page load, so
 *    closing the tab mid-processing loses nothing.
 */

import { connect } from './lib/auth.js';
import { ApiClient } from './lib/api.js';
import { ext } from './lib/env.js';
import { RecordingStore } from './lib/db.js';
import { CEFR_LEVELS, LEARNING_LANGUAGES, NATIVE_LANGUAGES } from './lib/languages.js';
import { RecordingSession, listMicrophones } from './lib/recording.js';
import { DEFAULT_API_BASE, ensureOriginPermission, getSettings, saveSettings, clearToken } from './lib/settings.js';
import { captureTabAudio, getArmedLessonTab, tabCaptureAvailable } from './lib/tabaudio.js';
import { pollProcessing, uploadRecording } from './lib/uploader.js';

const $ = (id) => document.getElementById(id);

let store;
let session;
let settings;
let timerInterval = null;
const pollers = new Map(); // recordingId -> {stop}
// Uploads currently in flight. Guards against a double-clicked Upload button
// firing two POSTs for one recording (= two paid submissions server-side).
const inFlightUploads = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function api() {
  return new ApiClient(settings.apiBase, settings.token);
}

function fmtDuration(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showError(el, message) {
  el.textContent = message ?? '';
  el.hidden = !message;
}

function fillSelect(select, pairs, selected) {
  select.replaceChildren();
  for (const [value, label] of pairs) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.append(option);
  }
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

function renderConnState() {
  const pill = $('conn-status');
  if (settings.token) {
    pill.textContent = 'Connected';
    pill.className = 'pill pill-green';
    $('disconnect-btn').hidden = false;
    $('connect-btn').textContent = 'Reconnect';
    $('settings-panel').hidden = true;
  } else {
    pill.textContent = 'Not connected';
    pill.className = 'pill pill-muted';
    $('disconnect-btn').hidden = true;
    $('connect-btn').textContent = 'Connect to LingoChunk';
    $('settings-panel').hidden = false;
  }
}

async function handleConnect() {
  showError($('settings-error'), null);
  const apiBase = ($('api-base').value.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  try {
    new URL(apiBase);
  } catch {
    showError($('settings-error'), 'That server URL is not valid.');
    return;
  }
  try {
    const granted = await ensureOriginPermission(apiBase);
    if (!granted) {
      showError($('settings-error'), 'Permission to contact the server was declined.');
      return;
    }
    const token = await connect(apiBase);
    settings = { ...settings, apiBase, token };
    await saveSettings({ apiBase, token });
    renderConnState();
    await loadCollections();
  } catch (error) {
    showError($('settings-error'), error.message ?? String(error));
  }
}

async function handleSaveManualToken() {
  showError($('settings-error'), null);
  const token = $('manual-token').value.trim();
  const apiBase = ($('api-base').value.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  if (!token.startsWith('lcp_')) {
    showError($('settings-error'), 'That does not look like a LingoChunk token (lcp_…).');
    return;
  }
  const granted = await ensureOriginPermission(apiBase);
  if (!granted) {
    showError($('settings-error'), 'Permission to contact the server was declined.');
    return;
  }
  settings = { ...settings, apiBase, token };
  await saveSettings({ apiBase, token });
  $('manual-token').value = '';
  renderConnState();
  await loadCollections();
}

async function handleDisconnect() {
  await clearToken();
  settings = { ...settings, token: null };
  renderConnState();
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

async function loadCollections() {
  const select = $('collection-select');
  if (!settings.token) return;
  try {
    const collections = await api().listCollections();
    const current = settings.collection;
    select.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— none —';
    select.append(none);
    for (const c of collections) {
      const option = document.createElement('option');
      option.value = c.slug;
      option.textContent = c.name;
      option.selected = c.slug === current;
      select.append(option);
    }
  } catch {
    // Collections are optional; a failure here must never block recording.
  }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function refreshMics() {
  const mics = await listMicrophones();
  fillSelect(
    $('mic-select'),
    [['', 'Default microphone'], ...mics.map((m) => [m.deviceId, m.label])],
    settings.micDeviceId,
  );
}

/** Show/refresh the source picker (Chrome only — Firefox cannot capture tab
 *  audio, so the field stays hidden and everything records mic-only). */
async function refreshSourceOptions() {
  if (!tabCaptureAvailable()) return;
  $('source-field').hidden = false;
  const armed = await getArmedLessonTab();
  const tabOption = $('source-tab-option');
  const hint = $('tab-hint');
  if (armed) {
    const title = armed.title.length > 40 ? `${armed.title.slice(0, 40)}…` : armed.title;
    tabOption.disabled = false;
    tabOption.textContent = `Microphone + tab: ${title}`;
    hint.hidden = $('source-select').value !== 'mic+tab';
    hint.textContent =
      'Records you and the lesson tab together. Wear headphones so the ' +
      "teacher's voice isn't picked up twice.";
  } else {
    tabOption.disabled = true;
    tabOption.textContent = 'Microphone + lesson tab';
    if ($('source-select').value === 'mic+tab') $('source-select').value = 'mic';
    hint.hidden = false;
    hint.textContent =
      'To record an online lesson too, open its tab and click the ' +
      'LingoChunk icon there — then pick "Microphone + tab" here.';
  }
}

function currentMeta() {
  return {
    title: $('rec-title').value.trim(),
    learningLanguage: $('learning-lang').value,
    nativeLanguage: $('native-lang').value,
    level: $('level-select').value,
    collection: $('collection-select').value,
  };
}

async function toggleRecording() {
  showError($('record-error'), null);
  const btn = $('record-btn');
  if (session.active) {
    btn.disabled = true;
    try {
      await session.stop();
    } finally {
      btn.disabled = false;
    }
    btn.classList.remove('recording');
    $('record-label').textContent = 'Start recording';
    $('timer').hidden = true;
    clearInterval(timerInterval);
    await renderRecordings();
    return;
  }

  try {
    const meta = currentMeta();
    await saveSettings({
      learningLanguage: meta.learningLanguage,
      nativeLanguage: meta.nativeLanguage,
      level: meta.level,
      collection: meta.collection,
      micDeviceId: $('mic-select').value,
    });

    // Capture the armed lesson tab when the mic+tab source is selected.
    let tabStream = null;
    if (tabCaptureAvailable() && $('source-select').value === 'mic+tab') {
      const armed = await getArmedLessonTab();
      if (!armed) {
        showError(
          $('record-error'),
          'The lesson tab is gone. Open it and click the LingoChunk icon there, then try again.',
        );
        return;
      }
      try {
        tabStream = await captureTabAudio(armed.tabId);
      } catch {
        showError(
          $('record-error'),
          'Could not capture the lesson tab. Click the LingoChunk icon on that tab, then try again.',
        );
        return;
      }
    }

    await session.start(meta, { micDeviceId: $('mic-select').value, tabStream });
    btn.classList.add('recording');
    $('record-label').textContent = 'Stop recording';
    $('timer').hidden = false;
    timerInterval = setInterval(() => {
      $('timer').textContent = fmtDuration(session.elapsedMs);
    }, 500);
    await refreshMics(); // labels become available after the first grant
    await renderRecordings();
  } catch (error) {
    showError(
      $('record-error'),
      error.name === 'NotAllowedError'
        ? 'Microphone access was declined. Allow it to record.'
        : (error.message ?? String(error)),
    );
  }
}

// ---------------------------------------------------------------------------
// Recordings list
// ---------------------------------------------------------------------------

const STATUS_PILLS = {
  recording: ['Recording…', 'pill-red'],
  recorded: ['Ready to upload', 'pill-blue'],
  uploading: ['Uploading…', 'pill-blue'],
  processing: ['Processing…', 'pill-blue'],
  uploaded: ['In your library', 'pill-green'],
  failed: ['Failed', 'pill-red'],
};

function actionButton(label, onClick, className = 'btn btn-small') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function handleUpload(recordingId) {
  if (inFlightUploads.has(recordingId)) return;
  if (!settings.token) {
    $('settings-panel').hidden = false;
    showError($('settings-error'), 'Connect to LingoChunk first, then upload.');
    return;
  }
  inFlightUploads.add(recordingId);
  await renderRecordings(); // repaint immediately: Upload button gone
  try {
    const row = await uploadRecording(store, api(), recordingId);
    startPolling(row);
  } catch {
    // Row already parked in `failed` with the server message.
  } finally {
    inFlightUploads.delete(recordingId);
    await renderRecordings();
  }
}

function startPolling(row) {
  if (!row.submissionId || pollers.has(row.id)) return;
  const poller = pollProcessing(api(), row.submissionId, {
    onUpdate: async (body) => {
      if (body.status === 'ready') {
        await store.updateRecording(row.id, { status: 'uploaded' });
        pollers.delete(row.id);
        await renderRecordings();
      } else if (body.status === 'failed') {
        await store.updateRecording(row.id, {
          status: 'failed',
          error: body.error || 'Processing failed.',
        });
        pollers.delete(row.id);
        await renderRecordings();
      } else {
        const line = document.querySelector(`[data-status-for="${row.id}"]`);
        if (line) {
          line.textContent = `${body.step || 'processing'} — ${body.progress ?? 0}%`;
        }
      }
    },
  });
  pollers.set(row.id, poller);
  // A permanent poll error (revoked token, deleted submission) must not
  // strand the row at "Processing…" as an unhandled rejection. Park it as
  // failed; the row keeps its submissionId, so the UI offers "Check status"
  // (resume polling) rather than "Retry upload" — the audio was already
  // uploaded and re-posting it would duplicate the submission.
  poller.promise.catch(async (error) => {
    pollers.delete(row.id);
    await store.updateRecording(row.id, {
      status: 'failed',
      error: `Could not check processing status: ${error.message ?? error}`,
    });
    await renderRecordings();
  });
}

async function resumePolling(row) {
  await store.updateRecording(row.id, { status: 'processing', error: null });
  startPolling(row);
  await renderRecordings();
}

async function handleDownload(recordingId) {
  const row = await store.getRecording(recordingId);
  const blob = await store.assembleBlob(recordingId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${row.title || 'recording'}.${row.mimeType.includes('ogg') ? 'ogg' : 'webm'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function handleDelete(recordingId) {
  const row = await store.getRecording(recordingId);
  const uploaded = row.status === 'uploaded';
  const message = uploaded
    ? 'Remove this recording from this device? (It stays in your LingoChunk library.)'
    : 'Delete this recording? It has not been uploaded and cannot be recovered.';
  if (!window.confirm(message)) return;
  pollers.get(recordingId)?.stop();
  pollers.delete(recordingId);
  await store.deleteRecording(recordingId);
  await renderRecordings();
}

async function renderRecordings() {
  const list = $('recordings');
  const rows = await store.listRecordings();
  $('empty-note').hidden = rows.length > 0;
  list.replaceChildren();

  for (const row of rows) {
    const li = document.createElement('li');
    // A row whose upload is in flight renders as uploading even if the store
    // still says `recorded` — the guard set is the truth for button state.
    const status = inFlightUploads.has(row.id) ? 'uploading' : row.status;

    const head = document.createElement('div');
    head.className = 'rec-head';
    const title = document.createElement('span');
    title.className = 'rec-title';
    title.textContent = row.title || 'Untitled recording';
    const meta = document.createElement('span');
    meta.className = 'rec-meta';
    meta.textContent =
      `${new Date(row.createdAt).toLocaleString()} · ${fmtDuration(row.durationMs)} · ` +
      `${fmtSize(row.sizeBytes)} · ${row.learningLanguage}` +
      (row.source === 'mic+tab' ? ' · with tab audio' : '');
    const [pillText, pillClass] = STATUS_PILLS[status] ?? [status, 'pill-muted'];
    const pill = document.createElement('span');
    pill.className = `pill ${pillClass}`;
    pill.textContent = pillText;
    head.append(title, meta, pill);
    li.append(head);

    if (status === 'processing') {
      const line = document.createElement('div');
      line.className = 'rec-status-line';
      line.dataset.statusFor = row.id;
      line.textContent = 'processing…';
      li.append(line);
    }
    if (status === 'failed' && row.error) {
      const line = document.createElement('div');
      line.className = 'rec-status-line';
      line.textContent = row.error;
      li.append(line);
    }

    const actions = document.createElement('div');
    actions.className = 'rec-actions';
    if (status === 'recorded') {
      actions.append(actionButton('Upload', () => handleUpload(row.id), 'btn btn-small btn-primary'));
    }
    if (status === 'failed') {
      if (row.submissionId) {
        // The audio already reached the server; re-posting it would create a
        // duplicate submission. Offer to resume the status poll instead.
        actions.append(actionButton('Check status', () => resumePolling(row), 'btn btn-small btn-primary'));
      } else {
        actions.append(actionButton('Retry upload', () => handleUpload(row.id), 'btn btn-small btn-primary'));
      }
    }
    if (row.submissionId && (status === 'uploaded' || status === 'processing' || status === 'failed')) {
      const link = document.createElement('a');
      link.href = api().submissionUrl(row.submissionId);
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open in LingoChunk';
      link.className = 'btn btn-small';
      actions.append(link);
    }
    if (status !== 'recording' && status !== 'uploading') {
      actions.append(actionButton('Download', () => handleDownload(row.id)));
      actions.append(actionButton('Delete', () => handleDelete(row.id), 'btn btn-small btn-danger-ghost'));
    }
    li.append(actions);
    list.append(li);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  settings = await getSettings();
  store = await RecordingStore.open();
  session = new RecordingSession(store);
  session.onerror = (error) => showError($('record-error'), error.message ?? String(error));
  // The captured lesson tab closed mid-take: stop gracefully — everything up
  // to this moment is already chunked in IndexedDB.
  session.onsourceended = () => {
    if (!session.active) return;
    void toggleRecording();
    showError($('record-error'), 'The lesson tab closed, so the recording was stopped.');
  };

  await store.recoverInterrupted();

  $('api-base').value = settings.apiBase;
  fillSelect($('learning-lang'), LEARNING_LANGUAGES, settings.learningLanguage);
  fillSelect($('native-lang'), NATIVE_LANGUAGES, settings.nativeLanguage);
  fillSelect($('level-select'), CEFR_LEVELS.map((l) => [l, l]), settings.level);
  renderConnState();
  await refreshMics();
  await refreshSourceOptions();
  await renderRecordings();
  await loadCollections();

  // Resume polling for anything the last session left processing.
  for (const row of await store.listRecordings()) {
    if (row.status === 'processing') startPolling(row);
  }

  $('record-btn').addEventListener('click', () => void toggleRecording());
  $('connect-btn').addEventListener('click', () => void handleConnect());
  $('disconnect-btn').addEventListener('click', () => void handleDisconnect());
  $('save-token-btn').addEventListener('click', () => void handleSaveManualToken());
  $('toggle-settings').addEventListener('click', () => {
    $('settings-panel').hidden = !$('settings-panel').hidden;
  });
  $('source-select').addEventListener('change', () => void refreshSourceOptions());
  // A toolbar click on a lesson tab (re)arms it while this page is open.
  ext?.storage?.onChanged?.addListener?.(() => void refreshSourceOptions());
  window.addEventListener('focus', () => void refreshSourceOptions());

  window.addEventListener('beforeunload', (event) => {
    if (session.active) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

void init();
