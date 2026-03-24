import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorStore } from '../server/src/errors.js';
import { handleGetErrors, handleClearErrors, handleGetErrorStats } from '../server/src/tools.js';

function seedStore(store: ErrorStore) {
  store.add({
    message: 'TypeError: x is undefined',
    stack: 'at app.js:42',
    source: 'console.error',
    url: 'http://localhost:3000/dashboard',
    line: 42,
    column: 15,
    timestamp: '2026-03-24T14:00:00Z',
    count: 1,
  });
  store.add({
    message: 'Uncaught ReferenceError',
    stack: 'at index.js:10',
    source: 'uncaught_exception',
    url: 'https://mysite.vercel.app/',
    line: 10,
    column: 1,
    timestamp: '2026-03-24T14:05:00Z',
    count: 1,
  });
}

describe('handleGetErrors', () => {
  let store: ErrorStore;

  beforeEach(() => {
    store = new ErrorStore();
    seedStore(store);
  });

  it('returns all errors with no filters', () => {
    const result = handleGetErrors(store, {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
  });

  it('filters by url', () => {
    const result = handleGetErrors(store, { url_filter: 'localhost' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toContain('TypeError');
  });

  it('filters by since', () => {
    const result = handleGetErrors(store, { since: '2026-03-24T14:03:00Z' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toContain('ReferenceError');
  });

  it('returns message when no errors', () => {
    const empty = new ErrorStore();
    const result = handleGetErrors(empty, {});
    expect(result).toContain('No errors');
  });

  it('filters by since shorthand', () => {
    const result = handleGetErrors(store, { since: '1m' });
    // Both test errors are from 2026, so "1m" ago from now won't include them
    expect(result).toContain('No errors');
  });

  it('returns error message for invalid since', () => {
    const result = handleGetErrors(store, { since: 'abc' });
    expect(result).toContain('Invalid');
  });

  it('combines url_filter and since', () => {
    const result = handleGetErrors(store, { url_filter: 'localhost', since: '2026-03-24T13:00:00Z' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].url).toContain('localhost');
  });
});

describe('handleClearErrors', () => {
  it('clears all and returns count', () => {
    const store = new ErrorStore();
    seedStore(store);
    const result = handleClearErrors(store, {});
    expect(result).toContain('2');
    expect(store.getAll()).toHaveLength(0);
  });

  it('clears by url filter', () => {
    const store = new ErrorStore();
    seedStore(store);
    const result = handleClearErrors(store, { url_filter: 'vercel' });
    expect(result).toContain('1');
    expect(store.getAll()).toHaveLength(1);
  });
});

describe('handleGetErrorStats', () => {
  it('returns stats summary', () => {
    const store = new ErrorStore();
    seedStore(store);
    const result = handleGetErrorStats(store);
    expect(result).toContain('2');
    expect(result).toContain('localhost:3000');
  });

  it('returns empty message when no errors', () => {
    const store = new ErrorStore();
    const result = handleGetErrorStats(store);
    expect(result).toContain('No errors');
  });
});
