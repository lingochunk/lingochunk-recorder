/** Auto-stop presets shared by the popup and the recorder page. Values are
 *  minutes as strings (select option values); 0 = record until stopped and
 *  'custom' reveals a free minutes input (e.g. a 12-minute video). */
export const AUTO_STOP_OPTIONS = [
  ['0', 'Manual stop'],
  ['15', 'After 15 minutes'],
  ['30', 'After 30 minutes'],
  ['45', 'After 45 minutes'],
  ['60', 'After 1 hour'],
  ['90', 'After 1.5 hours'],
  ['custom', 'Custom...'],
];

const PRESET_VALUES = new Set(AUTO_STOP_OPTIONS.map(([value]) => value));

/** The select value that represents a stored minutes number. */
export function selectValueFor(minutes) {
  const value = String(minutes ?? 0);
  return PRESET_VALUES.has(value) ? value : 'custom';
}

/** Clamp a custom minutes input to something sane (0 = no auto-stop). */
export function clampCustomMinutes(raw) {
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(Math.round(minutes), 600);
}
