#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
      content: [{ type: 'text' as const, text: handleGetErrors(store, args) }],
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
      content: [{ type: 'text' as const, text: handleClearErrors(store, args) }],
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
      content: [{ type: 'text' as const, text: handleGetErrorStats(store) }],
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
