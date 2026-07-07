/**
 * The language sets offered by the pickers.
 *
 * These mirror the server's canonical sets (lingochunk_shared.enums.Language):
 * LEARNING is the curated audio-source set; NATIVE (translation targets) is a
 * superset. The server validates on upload, so a drift here degrades to a
 * clear 400, never a broken submission — but keep them in sync when the app
 * adds languages.
 */

export const LEARNING_LANGUAGES = [
  ['de', 'German'],
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['ru', 'Russian'],
  ['pl', 'Polish'],
  ['el', 'Greek'],
  ['sv', 'Swedish'],
  ['uk', 'Ukrainian'],
  ['cs', 'Czech'],
  ['zh', 'Chinese'],
  ['ja', 'Japanese'],
];

const TRANSLATION_ONLY = [
  ['hr', 'Croatian'],
  ['da', 'Danish'],
  ['et', 'Estonian'],
  ['fi', 'Finnish'],
  ['hu', 'Hungarian'],
  ['id', 'Indonesian'],
  ['lv', 'Latvian'],
  ['lt', 'Lithuanian'],
  ['no', 'Norwegian'],
  ['ro', 'Romanian'],
  ['sk', 'Slovak'],
  ['sl', 'Slovenian'],
  ['sw', 'Swahili'],
  ['tr', 'Turkish'],
  ['ko', 'Korean'],
  ['bg', 'Bulgarian'],
  ['sr', 'Serbian'],
  ['hi', 'Hindi'],
  ['bn', 'Bengali'],
  ['th', 'Thai'],
  ['vi', 'Vietnamese'],
];

export const NATIVE_LANGUAGES = [...LEARNING_LANGUAGES, ...TRANSLATION_ONLY].sort(
  (a, b) => a[1].localeCompare(b[1]),
);

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
