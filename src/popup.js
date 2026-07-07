/**
 * Toolbar popup: a remote control for the recorder.
 *
 * The popup itself cannot host a recording (Chrome destroys the popup's JS
 * context the moment it loses focus), so the actual capture always runs in
 * the recorder page — opened as a BACKGROUND tab so the user never leaves
 * their lesson. This popup arms the current tab, tells the recorder to
 * start/stop via runtime messaging, and mirrors its status. Closing the
 * popup mid-recording is fine by design.
 */

import { ext } from './lib/env.js';
import { getSettings, saveSettings } from './lib/settings.js';
import { armLessonTab, tabCaptureAvailable } from './lib/tabaudio.js';

const RECORDER_URL = ext.runtime.getURL('src/recorder.html');
const $ = (id) => document.getElementById(id);

let timerInterval = null;
// The recording saved by the last Stop, offered for sending from this popup.
let lastRecordingId = null;

function showState(name) {
  for (const state of ['idle', 'recording', 'saved', 'sent']) {
    $(`state-${state}`).hidden = state !== name;
  }
}

function showError(message) {
  $('popup-error').textContent = message ?? '';
  $('popup-error').hidden = !message;
}

function fmtDuration(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The tab id of the recorder page we control, learned from its rec-status
// reply. Every command is addressed to it so a second recorder tab (a user
// can always open one manually) never answers on its behalf.
let recorderTabId;

async function activeTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/** Message the recorder page, retrying while a fresh tab finishes loading.
 *  Returns undefined when no recorder answered. */
async function sendToRecorder(message, tries = 25) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const reply = await ext.runtime.sendMessage(message);
      if (reply !== undefined) return reply;
    } catch {
      // "Receiving end does not exist" — the page is still loading.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return undefined;
}

/** Locate a live recorder page via messaging (tab urls are not visible to us
 *  without broad permissions, so the recorder self-reports its tab id).
 *  Returns its status or null. */
async function locateRecorder(tries = 1) {
  const status = await sendToRecorder({ type: 'rec-status' }, tries);
  if (status) recorderTabId = status.tabId;
  return status ?? null;
}

/** A recorder status, creating the page as a background tab if none exists. */
async function ensureRecorder() {
  const existing = await locateRecorder();
  if (existing) return existing;
  await ext.tabs.create({ url: RECORDER_URL, active: false });
  return locateRecorder(25);
}

async function openRecorder() {
  const status = await locateRecorder();
  let tab;
  if (status?.tabId !== undefined) {
    tab = await ext.tabs.update(status.tabId, { active: true });
  } else {
    tab = await ext.tabs.create({ url: RECORDER_URL, active: true });
  }
  if (tab?.windowId !== undefined) await ext.windows.update(tab.windowId, { focused: true });
  window.close();
}

function startTimer(baseElapsedMs, startedAtMonotonic) {
  const paint = () => {
    $('popup-timer').textContent = fmtDuration(baseElapsedMs + (Date.now() - startedAtMonotonic));
  };
  paint();
  clearInterval(timerInterval);
  timerInterval = setInterval(paint, 500);
}

async function micPermissionGranted() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state === 'granted';
  } catch {
    // Firefox has no 'microphone' permission name — proceed optimistically.
    return true;
  }
}

async function startRecording(mode) {
  showError(null);

  // First run: the mic grant needs a visible extension page — a prompt cannot
  // appear for a background tab. Send the user to the recorder once.
  if (!(await micPermissionGranted())) {
    await openRecorder();
    return;
  }

  if (mode === 'mic+tab') {
    const tab = await activeTab();
    if (!(await armLessonTab(tab))) {
      showError('This page cannot be captured. Try from the lesson tab.');
      return;
    }
  }

  const status = await ensureRecorder();
  if (!status) {
    showError('The recorder did not respond. Open it and try from there.');
    return;
  }
  if (status.active) {
    showState('recording');
    startTimer(status.elapsedMs ?? 0, Date.now());
    return;
  }
  const reply = await sendToRecorder({ type: 'rec-start', mode, tabId: recorderTabId });
  if (!reply) {
    showError('The recorder did not respond. Open it and try from there.');
    return;
  }
  if (reply.error) {
    showError(reply.error);
    return;
  }
  showState('recording');
  startTimer(0, Date.now());
}

async function stopRecording() {
  showError(null);
  clearInterval(timerInterval);
  const reply = await sendToRecorder({ type: 'rec-stop', tabId: recorderTabId }, 5);
  if (!reply || reply.error) {
    showError(reply?.error ?? 'The recorder did not respond.');
    return;
  }
  lastRecordingId = reply.recordingId ?? null;
  showState('saved');
}

async function sendLastRecording() {
  showError(null);
  if (!lastRecordingId) {
    showError('Nothing to send — record something first.');
    return;
  }
  const notify = $('notify-check').checked;
  void saveSettings({ notifyDefault: notify }); // sticky for next time
  const btn = $('send-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const reply = await sendToRecorder(
      { type: 'rec-send', recordingId: lastRecordingId, notify, tabId: recorderTabId },
      3,
    );
    if (!reply || reply.error) {
      showError(reply?.error ?? 'The recorder did not respond.');
      return;
    }
    $('sent-hint').textContent = notify
      ? "You'll get an email when it's ready."
      : 'It will appear in your LingoChunk library when processing finishes.';
    showState('sent');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send to LingoChunk';
  }
}

async function init() {
  const settings = await getSettings();
  $('notify-check').checked = settings.notifyDefault;

  // Mirror the recorder's live state, if one is open.
  const status = await locateRecorder();
  if (status?.active) {
    showState('recording');
    startTimer(status.elapsedMs ?? 0, Date.now());
  } else {
    showState('idle');
    const tab = await activeTab();
    const capturable =
      tabCaptureAvailable() && tab && (tab.url === undefined || /^https?:/.test(tab.url));
    $('rec-tab-btn').hidden = !capturable;
    if (capturable && tab.title) {
      const title = tab.title.length > 26 ? `${tab.title.slice(0, 26)}…` : tab.title;
      $('rec-tab-label').textContent = `Record mic + “${title}”`;
    }
    $('idle-hint').textContent =
      `Recording in ${settings.learningLanguage.toUpperCase()} · ` +
      'change languages in the recorder.';
  }

  $('rec-tab-btn').addEventListener('click', () => void startRecording('mic+tab'));
  $('rec-mic-btn').addEventListener('click', () => void startRecording('mic'));
  $('stop-btn').addEventListener('click', () => void stopRecording());
  $('send-btn').addEventListener('click', () => void sendLastRecording());
  $('open-recorder').addEventListener('click', () => void openRecorder());
}

void init();
