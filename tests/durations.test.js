import { describe, expect, it } from 'vitest';
import { clampCustomMinutes, selectValueFor } from '../src/lib/durations.js';

describe('selectValueFor', () => {
  it('maps stored minutes to the matching preset', () => {
    expect(selectValueFor(0)).toBe('0');
    expect(selectValueFor(45)).toBe('45');
  });

  it('maps non-preset minutes (a 12-minute video) to custom', () => {
    expect(selectValueFor(12)).toBe('custom');
    expect(selectValueFor(120)).toBe('custom');
  });
});

describe('clampCustomMinutes', () => {
  it('accepts sensible values and rounds', () => {
    expect(clampCustomMinutes('12')).toBe(12);
    expect(clampCustomMinutes(7.6)).toBe(8);
  });

  it('treats junk and non-positive input as no auto-stop', () => {
    expect(clampCustomMinutes('')).toBe(0);
    expect(clampCustomMinutes('abc')).toBe(0);
    expect(clampCustomMinutes(-5)).toBe(0);
  });

  it('caps runaway values at 10 hours', () => {
    expect(clampCustomMinutes(99999)).toBe(600);
  });
});
