import { describe, it, expect } from 'vitest';
import { parseSince } from '../server/src/parse-since.js';

describe('parseSince', () => {
  it('parses seconds shorthand', () => {
    const now = new Date('2026-03-24T14:00:30Z');
    const result = parseSince('30s', now);
    expect(result).toEqual(new Date('2026-03-24T14:00:00Z'));
  });

  it('parses minutes shorthand', () => {
    const now = new Date('2026-03-24T14:05:00Z');
    const result = parseSince('5m', now);
    expect(result).toEqual(new Date('2026-03-24T14:00:00Z'));
  });

  it('parses hours shorthand', () => {
    const now = new Date('2026-03-24T15:00:00Z');
    const result = parseSince('1h', now);
    expect(result).toEqual(new Date('2026-03-24T14:00:00Z'));
  });

  it('parses ISO timestamp', () => {
    const result = parseSince('2026-03-24T14:00:00Z');
    expect(result).toEqual(new Date('2026-03-24T14:00:00Z'));
  });

  it('returns null for invalid input', () => {
    const result = parseSince('abc');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseSince('');
    expect(result).toBeNull();
  });
});
