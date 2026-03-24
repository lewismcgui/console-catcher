# Console Catcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension + MCP server that captures browser console errors and makes them available to Claude Code via MCP tools.

**Architecture:** Chrome extension (MAIN world page script → content script → background service worker) captures `console.error`, uncaught exceptions, and unhandled promise rejections from all tabs. POSTs errors to a local MCP server (localhost:3777) which stores them in memory. MCP server exposes `get_errors`, `clear_errors`, and `get_error_stats` tools via stdio.

**Tech Stack:** TypeScript (MCP server), JavaScript (Chrome extension), `@modelcontextprotocol/server` (v2 SDK), Chrome Extension Manifest V3, Zod

---

## File Structure

```
console-catcher/
  extension/
    manifest.json          — V3 manifest with MAIN world content script, background SW, popup
    page.js                — MAIN world script: hooks console.error, onerror, unhandledrejection
    content.js             — ISOLATED world: relays postMessage → chrome.runtime.sendMessage
    background.js          — Service worker: receives messages, POSTs to localhost:3777
    popup.html             — Minimal popup UI (status dot + error count)
    popup.js               — Popup logic (GET /health, GET /stats)
    icons/                 — Extension icons (generated simple SVGs or PNGs)
  server/
    src/
      index.ts             — Entry point: starts HTTP server + MCP stdio server
      errors.ts            — Error store: in-memory array, dedup, cap, filtering
      tools.ts             — MCP tool definitions (get_errors, clear_errors, get_error_stats)
      parse-since.ts       — Parses "30s", "5m", "1h" shorthand to Date
    package.json           — Dependencies, bin field for global install
    tsconfig.json          — TypeScript config
  tests/
    errors.test.ts         — Unit tests for error store
    parse-since.test.ts    — Unit tests for since parser
    tools.test.ts          — Unit tests for MCP tools
    integration.test.ts    — End-to-end: POST errors → query via MCP tools
  README.md
  LICENSE
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "console-catcher",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server that captures browser console errors for AI coding assistants",
  "main": "dist/index.js",
  "bin": {
    "console-catcher": "dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --banner.js '#!/usr/bin/env node'",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["mcp", "console", "errors", "debugging", "claude-code"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/server": "^1.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "tsup": "^8.0.0",
    "vitest": "^3.2.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd /Users/lewis/Downloads/console-catcher/server && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/lewis/Downloads/console-catcher/server && mkdir -p src && echo 'console.log("ok")' > src/index.ts && npx tsc`
Expected: `dist/index.js` created.

- [ ] **Step 5: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add server/package.json server/tsconfig.json server/package-lock.json
git commit -m "scaffold: server package with MCP SDK and TypeScript"
```

---

### Task 2: Since Parser

**Files:**
- Create: `server/src/parse-since.ts`
- Create: `tests/parse-since.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/parse-since.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/parse-since.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement parse-since.ts**

Create `server/src/parse-since.ts`:

```typescript
const SHORTHAND_RE = /^(\d+)(s|m|h)$/;

export function parseSince(value: string, now: Date = new Date()): Date | null {
  if (!value) return null;

  const match = value.match(SHORTHAND_RE);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const ms = unit === 's' ? amount * 1000
             : unit === 'm' ? amount * 60_000
             : amount * 3_600_000;
    return new Date(now.getTime() - ms);
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/parse-since.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add server/src/parse-since.ts tests/parse-since.test.ts
git commit -m "feat: add since-time parser for shorthand and ISO timestamps"
```

---

### Task 3: Error Store

**Files:**
- Create: `server/src/errors.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/errors.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement errors.ts**

Create `server/src/errors.ts`:

```typescript
export interface CapturedError {
  message: string;
  stack: string;
  source: 'console.error' | 'uncaught_exception' | 'unhandled_rejection';
  url: string;
  line: number;
  column: number;
  timestamp: string;
  count: number;
}

export interface ErrorFilter {
  urlFilter?: string;
  since?: Date;
}

export interface ErrorStats {
  total: number;
  byDomain: Record<string, number>;
  oldest: string | null;
  newest: string | null;
}

const DEDUP_WINDOW_MS = 5000;

export class ErrorStore {
  private errors: CapturedError[] = [];
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  add(error: CapturedError): void {
    // Check for dedup: same message + url + line within 5 seconds
    const last = this.errors[this.errors.length - 1];
    if (last
      && last.message === error.message
      && last.url === error.url
      && last.line === error.line
      && Math.abs(new Date(error.timestamp).getTime() - new Date(last.timestamp).getTime()) < DEDUP_WINDOW_MS
    ) {
      last.count++;
      return;
    }

    this.errors.push({ ...error, count: error.count ?? 1 });

    // Cap: drop oldest
    if (this.errors.length > this.maxSize) {
      this.errors = this.errors.slice(this.errors.length - this.maxSize);
    }
  }

  getAll(filter?: ErrorFilter): CapturedError[] {
    let result = this.errors;

    if (filter?.urlFilter) {
      const f = filter.urlFilter.toLowerCase();
      result = result.filter(e => e.url.toLowerCase().includes(f));
    }

    if (filter?.since) {
      const sinceMs = filter.since.getTime();
      result = result.filter(e => new Date(e.timestamp).getTime() >= sinceMs);
    }

    return result;
  }

  clear(urlFilter?: string): number {
    if (!urlFilter) {
      const count = this.errors.length;
      this.errors = [];
      return count;
    }

    const f = urlFilter.toLowerCase();
    const before = this.errors.length;
    this.errors = this.errors.filter(e => !e.url.toLowerCase().includes(f));
    return before - this.errors.length;
  }

  getStats(): ErrorStats {
    if (this.errors.length === 0) {
      return { total: 0, byDomain: {}, oldest: null, newest: null };
    }

    const byDomain: Record<string, number> = {};
    for (const e of this.errors) {
      try {
        const domain = new URL(e.url).host;
        byDomain[domain] = (byDomain[domain] || 0) + 1;
      } catch {
        byDomain['unknown'] = (byDomain['unknown'] || 0) + 1;
      }
    }

    return {
      total: this.errors.length,
      byDomain,
      oldest: this.errors[0].timestamp,
      newest: this.errors[this.errors.length - 1].timestamp,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/errors.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add server/src/errors.ts tests/errors.test.ts
git commit -m "feat: add error store with dedup, cap, filtering, and stats"
```

---

### Task 4: MCP Tools

**Files:**
- Create: `server/src/tools.ts`
- Create: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tools.ts**

Create `server/src/tools.ts`:

```typescript
import { ErrorStore } from './errors.js';
import { parseSince } from './parse-since.js';

export function handleGetErrors(
  store: ErrorStore,
  args: { url_filter?: string; since?: string }
): string {
  const since = args.since ? parseSince(args.since) : undefined;
  if (args.since && since === null) {
    return `Invalid "since" value: "${args.since}". Use ISO timestamp or shorthand like "30s", "5m", "1h".`;
  }

  const errors = store.getAll({
    urlFilter: args.url_filter,
    since: since ?? undefined,
  });

  if (errors.length === 0) {
    return 'No errors captured.' + (args.since ? ` (filtered: since ${args.since})` : '');
  }

  return JSON.stringify(errors, null, 2);
}

export function handleClearErrors(
  store: ErrorStore,
  args: { url_filter?: string }
): string {
  const count = store.clear(args.url_filter);
  return `Cleared ${count} error(s).` + (args.url_filter ? ` (matching "${args.url_filter}")` : '');
}

export function handleGetErrorStats(store: ErrorStore): string {
  const stats = store.getStats();
  if (stats.total === 0) {
    return 'No errors captured.';
  }

  const domainLines = Object.entries(stats.byDomain)
    .map(([domain, count]) => `  ${domain}: ${count}`)
    .join('\n');

  return `Total errors: ${stats.total}\n\nBy domain:\n${domainLines}\n\nOldest: ${stats.oldest}\nNewest: ${stats.newest}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/tools.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add server/src/tools.ts tests/tools.test.ts
git commit -m "feat: add MCP tool handlers for get_errors, clear_errors, get_error_stats"
```

---

### Task 5: MCP Server + HTTP Receiver (Main Entry Point)

**Files:**
- Create: `server/src/index.ts`
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';

// We test the HTTP receiver directly, not the full MCP stdio flow
// (MCP stdio requires a transport that's hard to test in isolation)

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/integration.test.ts`
Expected: FAIL — `createHttpHandler` not found.

- [ ] **Step 3: Implement index.ts**

Create `server/src/index.ts`:

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { z } from 'zod';
import { ErrorStore } from './errors.js';
import { handleGetErrors, handleClearErrors, handleGetErrorStats } from './tools.js';

const PORT = 3777;

export function createHttpHandler(store: ErrorStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for Chrome extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', errors: store.getAll().length }));
      return;
    }

    if (req.method === 'GET' && req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(store.getStats()));
      return;
    }

    if (req.method === 'POST' && req.url === '/errors') {
      try {
        const body = await readBody(req);
        const data = JSON.parse(body);
        store.add({
          message: data.message ?? 'Unknown error',
          stack: data.stack ?? '',
          source: data.source ?? 'console.error',
          url: data.url ?? '',
          line: data.line ?? 0,
          column: data.column ?? 0,
          timestamp: data.timestamp ?? new Date().toISOString(),
          count: 1,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function registerTools(server: McpServer, store: ErrorStore) {
  server.registerTool(
    'get_errors',
    {
      title: 'Get Browser Errors',
      description: 'Get captured browser console errors. Use url_filter to filter by domain/URL (substring match). Use since to only get recent errors (e.g. "30s", "5m", "1h", or ISO timestamp).',
      inputSchema: z.object({
        url_filter: z.string().optional().describe('Filter errors by URL substring (e.g. "localhost", "mysite.com")'),
        since: z.string().optional().describe('Only return errors since this time. Shorthand: "30s", "5m", "1h". Or ISO timestamp.'),
      }),
    },
    async (args) => ({
      content: [{ type: 'text', text: handleGetErrors(store, args) }],
    })
  );

  server.registerTool(
    'clear_errors',
    {
      title: 'Clear Browser Errors',
      description: 'Clear captured browser console errors. Optionally filter by URL substring.',
      inputSchema: z.object({
        url_filter: z.string().optional().describe('Only clear errors matching this URL substring'),
      }),
    },
    async (args) => ({
      content: [{ type: 'text', text: handleClearErrors(store, args) }],
    })
  );

  server.registerTool(
    'get_error_stats',
    {
      title: 'Get Error Stats',
      description: 'Quick summary of captured errors: total count, count per domain, oldest/newest timestamp.',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: 'text', text: handleGetErrorStats(store) }],
    })
  );
}

async function main() {
  const store = new ErrorStore();

  // Start HTTP server for Chrome extension
  const httpServer = createServer(createHttpHandler(store));
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use. Is another instance running?`);
      process.exit(1);
    }
    throw err;
  });
  httpServer.listen(PORT, '127.0.0.1', () => {
    console.error(`Console Catcher HTTP server listening on http://127.0.0.1:${PORT}`);
  });

  // Start MCP server on stdio
  const mcpServer = new McpServer({
    name: 'console-catcher',
    version: '1.0.0',
  });
  registerTools(mcpServer, store);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Console Catcher MCP server running on stdio');
}

// Only run main when executed directly (not imported in tests)
import { fileURLToPath } from 'url';
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run integration tests**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run tests/integration.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Run all tests**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run`
Expected: All tests PASS (parse-since + errors + tools + integration).

- [ ] **Step 6: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add server/src/index.ts tests/integration.test.ts
git commit -m "feat: add MCP server with HTTP receiver and stdio transport"
```

---

### Task 6: Chrome Extension — Page Script (MAIN World)

**Files:**
- Create: `extension/page.js`

- [ ] **Step 1: Create page.js**

```javascript
// Runs in MAIN world — has access to the page's actual JS context.
// Hooks console.error, window.onerror, and unhandledrejection.
// Sends errors to content script via window.postMessage.

(function () {
  const CHANNEL = '__console_catcher__';

  function sendError(data) {
    window.postMessage({ channel: CHANNEL, payload: data }, '*');
  }

  // Hook console.error
  const originalError = console.error;
  console.error = function (...args) {
    originalError.apply(console, args);
    try {
      sendError({
        message: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
        stack: new Error().stack || '',
        source: 'console.error',
        url: location.href,
        line: 0,
        column: 0,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Never break the page
    }
  };

  // Hook uncaught exceptions
  const originalOnerror = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    try {
      sendError({
        message: String(message),
        stack: error?.stack || '',
        source: 'uncaught_exception',
        url: source || location.href,
        line: lineno || 0,
        column: colno || 0,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Never break the page
    }
    if (originalOnerror) return originalOnerror.apply(this, arguments);
  };

  // Hook unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event.reason;
      sendError({
        message: reason?.message || String(reason),
        stack: reason?.stack || '',
        source: 'unhandled_rejection',
        url: location.href,
        line: 0,
        column: 0,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Never break the page
    }
  });
})();
```

- [ ] **Step 2: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add extension/page.js
git commit -m "feat: add MAIN world page script for error capture"
```

---

### Task 7: Chrome Extension — Content Script + Background Service Worker

**Files:**
- Create: `extension/content.js`
- Create: `extension/background.js`

- [ ] **Step 1: Create content.js**

```javascript
// Runs in ISOLATED world. Listens for postMessage from page.js,
// forwards to background service worker.

const CHANNEL = '__console_catcher__';

window.addEventListener('message', function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.channel !== CHANNEL) return;

  chrome.runtime.sendMessage({
    type: 'console-catcher-error',
    payload: event.data.payload,
  });
});
```

- [ ] **Step 2: Create background.js**

```javascript
// Service worker. Receives errors from content script, POSTs to MCP server.

const SERVER_URL = 'http://127.0.0.1:3777';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'console-catcher-error') return;

  fetch(`${SERVER_URL}/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.payload),
  }).catch(() => {
    // Server not running — silently drop
  });
});
```

- [ ] **Step 3: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add extension/content.js extension/background.js
git commit -m "feat: add content script relay and background service worker"
```

---

### Task 8: Chrome Extension — Manifest + Popup

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/popup.html`
- Create: `extension/popup.js`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Console Catcher",
  "version": "1.0.0",
  "description": "Captures browser console errors for AI coding assistants like Claude Code",
  "permissions": [],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["page.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 220px;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #333;
      margin: 0;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ccc;
    }
    .dot.connected { background: #22c55e; }
    .dot.disconnected { background: #ef4444; }
    .title { font-weight: 600; }
    .stats { color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="dot" id="status-dot"></div>
    <span class="title">Console Catcher</span>
  </div>
  <div class="stats" id="stats">Checking...</div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create popup.js**

```javascript
const SERVER_URL = 'http://127.0.0.1:3777';

async function updateStatus() {
  const dot = document.getElementById('status-dot');
  const stats = document.getElementById('stats');

  try {
    const res = await fetch(`${SERVER_URL}/health`);
    const data = await res.json();
    dot.className = 'dot connected';
    stats.textContent = `${data.errors} error(s) captured`;
  } catch {
    dot.className = 'dot disconnected';
    stats.textContent = 'MCP server not running';
  }
}

updateStatus();
```

- [ ] **Step 4: Create placeholder PNG icons**

Chrome extensions require PNG icons. Generate minimal valid PNGs using Node.js raw Buffer approach (no external dependencies):

```bash
mkdir -p /Users/lewis/Downloads/console-catcher/extension/icons
```

Create a script `scripts/gen-icons.js` that generates minimal red circle PNG icons at 16x16, 48x48, and 128x128 using raw PNG binary encoding. Or simpler: download/create 3 small PNG files manually. The icons can be replaced with proper designed ones before Chrome Web Store submission.

For "Load unpacked" testing, any valid PNG works — even a 1x1 red pixel scaled up.

- [ ] **Step 5: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add extension/
git commit -m "feat: add Chrome extension manifest, popup, and icons"
```

---

### Task 9: Vitest Config + Test All

**Files:**
- Create: `vitest.config.ts` (project root)

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Create root package.json for test runner**

```json
{
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.0",
    "typescript": "^5.8.0",
    "@types/node": "^22.0.0"
  }
}
```

Run: `cd /Users/lewis/Downloads/console-catcher && npm install`

- [ ] **Step 3: Run all tests**

Run: `cd /Users/lewis/Downloads/console-catcher && npx vitest run`
Expected: All tests pass (parse-since: 6, errors: 10, tools: 10, integration: 5 = **31 tests**).

- [ ] **Step 4: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest config and root package.json"
```

---

### Task 10: Manual End-to-End Test

**Files:** None (testing only)

- [ ] **Step 1: Build the server**

Run: `cd /Users/lewis/Downloads/console-catcher/server && npm run build`
Expected: `dist/index.js` created with shebang line at top (`#!/usr/bin/env node`).

- [ ] **Step 2: Start the server**

Run: `cd /Users/lewis/Downloads/console-catcher/server && node dist/index.js`
Expected: "Console Catcher HTTP server listening on http://127.0.0.1:3777" on stderr.
(Note: MCP stdio will also start — that's fine, ignore stdin prompts.)

- [ ] **Step 3: Test HTTP endpoint manually**

In another terminal:
```bash
# POST an error
curl -X POST http://127.0.0.1:3777/errors \
  -H 'Content-Type: application/json' \
  -d '{"message":"Test error","stack":"at test.js:1","source":"console.error","url":"http://localhost:3000","line":1,"column":1,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'

# Check health
curl http://127.0.0.1:3777/health

# Check stats
curl http://127.0.0.1:3777/stats
```

Expected: All return 200 with correct JSON.

- [ ] **Step 4: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. Check it loads without errors

- [ ] **Step 5: Test full flow**

1. Keep the server running
2. Open any website in Chrome
3. Open DevTools console, type: `console.error("test from console")`
4. Check `curl http://127.0.0.1:3777/stats` — should show 1 error
5. Check `curl http://127.0.0.1:3777/health` — should show `errors: 1`

- [ ] **Step 6: Commit any fixes needed**

If anything needed fixing during manual testing, commit those fixes.

---

### Task 11: README + LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create LICENSE**

MIT license with current year.

- [ ] **Step 2: Create README.md**

Short, sharp README with:
- One-line description
- 3-step install
- How it works (the architecture diagram from the spec)
- The three MCP tools with examples
- "Why not Browser Tools MCP?" — one paragraph

Keep it under 100 lines. No bloat.

- [ ] **Step 3: Commit**

```bash
cd /Users/lewis/Downloads/console-catcher
git add README.md LICENSE
git commit -m "docs: add README and MIT license"
```
