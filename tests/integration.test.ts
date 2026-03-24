import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { ErrorStore } from '../server/src/errors.js';
import { createHttpHandler } from '../server/src/index.js';

describe('HTTP receiver', () => {
  let server: Server;
  let port: number;
  let store: ErrorStore;

  beforeAll(async () => {
    store = new ErrorStore();
    const handler = createHttpHandler(store);
    server = createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /errors stores an error', async () => {
    const res = await fetch(`http://localhost:${port}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test error',
        stack: 'at test.js:1',
        source: 'console.error',
        url: 'http://localhost:3000',
        line: 1,
        column: 1,
        timestamp: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    expect(store.getAll()).toHaveLength(1);
  });

  it('GET /health returns 200', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /stats returns error stats', async () => {
    const res = await fetch(`http://localhost:${port}/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('handles CORS preflight', async () => {
    const res = await fetch(`http://localhost:${port}/errors`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects invalid JSON', async () => {
    const res = await fetch(`http://localhost:${port}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});
