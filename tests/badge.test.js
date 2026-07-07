import { describe, expect, it } from 'vitest';
import { countUnsent } from '../src/lib/badge.js';

describe('countUnsent', () => {
  it('counts recordings that never reached the server', () => {
    const rows = [
      { status: 'recorded' }, // waiting to be sent
      { status: 'failed', submissionId: null }, // send failed before upload
      { status: 'failed', submissionId: 's1' }, // failed AFTER upload — server has it
      { status: 'processing', submissionId: 's2' },
      { status: 'uploaded', submissionId: 's3' },
      { status: 'recording' }, // in flight, not a reminder yet
    ];
    expect(countUnsent(rows)).toBe(2);
  });

  it('is zero when everything was sent or nothing exists', () => {
    expect(countUnsent([])).toBe(0);
    expect(countUnsent([{ status: 'uploaded', submissionId: 's' }])).toBe(0);
  });
});
