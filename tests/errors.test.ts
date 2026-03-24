import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorStore, type CapturedError } from '../server/src/errors.js';

function makeError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    message: 'Test error',
    stack: 'at test.js:1:1',
    source: 'console.error',
    url: 'http://localhost:3000/app',
    line: 1,
    column: 1,
    timestamp: new Date().toISOString(),
    count: 1,
    ...overrides,
  };
}

describe('ErrorStore', () => {
  let store: ErrorStore;

  beforeEach(() => {
    store = new ErrorStore(10); // small cap for testing
  });

  it('adds and retrieves errors', () => {
    store.add(makeError());
    expect(store.getAll()).toHaveLength(1);
  });

  it('caps at max size, dropping oldest', () => {
    for (let i = 0; i < 15; i++) {
      store.add(makeError({ message: `Error ${i}`, timestamp: new Date(Date.now() + i * 1000).toISOString() }));
    }
    const errors = store.getAll();
    expect(errors).toHaveLength(10);
    expect(errors[0].message).toBe('Error 5'); // oldest surviving
  });

  it('deduplicates same error within 5 seconds', () => {
    const now = new Date();
    store.add(makeError({ message: 'Dup', url: 'http://x.com', line: 10, timestamp: now.toISOString() }));
    store.add(makeError({ message: 'Dup', url: 'http://x.com', line: 10, timestamp: new Date(now.getTime() + 2000).toISOString() }));
    const errors = store.getAll();
    expect(errors).toHaveLength(1);
    expect(errors[0].count).toBe(2);
  });

  it('does NOT dedup if more than 5 seconds apart', () => {
    const now = new Date();
    store.add(makeError({ message: 'Dup', url: 'http://x.com', line: 10, timestamp: now.toISOString() }));
    store.add(makeError({ message: 'Dup', url: 'http://x.com', line: 10, timestamp: new Date(now.getTime() + 6000).toISOString() }));
    expect(store.getAll()).toHaveLength(2);
  });

  it('filters by url substring', () => {
    store.add(makeError({ url: 'http://localhost:3000/app' }));
    store.add(makeError({ url: 'https://mysite.vercel.app/dashboard' }));
    expect(store.getAll({ urlFilter: 'localhost' })).toHaveLength(1);
    expect(store.getAll({ urlFilter: 'vercel' })).toHaveLength(1);
  });

  it('filters by since timestamp', () => {
    const old = new Date('2026-03-24T12:00:00Z');
    const recent = new Date('2026-03-24T14:00:00Z');
    store.add(makeError({ timestamp: old.toISOString() }));
    store.add(makeError({ timestamp: recent.toISOString(), message: 'Recent' }));
    const filtered = store.getAll({ since: new Date('2026-03-24T13:00:00Z') });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].message).toBe('Recent');
  });

  it('clears all errors', () => {
    store.add(makeError());
    store.add(makeError({ message: 'Another' }));
    const count = store.clear();
    expect(count).toBe(2);
    expect(store.getAll()).toHaveLength(0);
  });

  it('clears only matching url', () => {
    store.add(makeError({ url: 'http://localhost:3000' }));
    store.add(makeError({ url: 'https://prod.com' }));
    const count = store.clear('localhost');
    expect(count).toBe(1);
    expect(store.getAll()).toHaveLength(1);
  });

  it('returns stats', () => {
    store.add(makeError({ url: 'http://localhost:3000', timestamp: '2026-03-24T12:00:00Z' }));
    store.add(makeError({ url: 'http://localhost:3000', timestamp: '2026-03-24T14:00:00Z', message: 'B' }));
    store.add(makeError({ url: 'https://prod.com', timestamp: '2026-03-24T13:00:00Z', message: 'C' }));
    const stats = store.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byDomain['localhost:3000']).toBe(2);
    expect(stats.byDomain['prod.com']).toBe(1);
    expect(stats.oldest).toBe('2026-03-24T12:00:00Z');
    expect(stats.newest).toBe('2026-03-24T14:00:00Z');
  });
});
