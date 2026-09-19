import { describe, expect, it } from 'vitest';
import {
  AUDIO_LANGUAGES,
  AUTO_LANGUAGE,
  LEARNING_LANGUAGES,
  NATIVE_LANGUAGES,
} from '../src/lib/languages.js';

describe('language pickers', () => {
  it('offers identification first in the learning picker', () => {
    expect(LEARNING_LANGUAGES[0]).toEqual([AUTO_LANGUAGE, 'Detect from the recording']);
    expect(LEARNING_LANGUAGES.slice(1)).toEqual(AUDIO_LANGUAGES);
  });

  it('never offers identification as a translation target', () => {
    expect(NATIVE_LANGUAGES.some(([code]) => code === AUTO_LANGUAGE)).toBe(false);
    // Every audio language is also a translation target.
    for (const [code] of AUDIO_LANGUAGES) {
      expect(NATIVE_LANGUAGES.some(([c]) => c === code)).toBe(true);
    }
  });

  it('keeps the server value for identification', () => {
    expect(AUTO_LANGUAGE).toBe('auto');
  });
});
