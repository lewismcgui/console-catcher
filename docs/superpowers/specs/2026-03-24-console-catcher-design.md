# Console Catcher — Design Spec

## Problem

Developers using AI coding tools (Claude Code, Cursor, etc.) push code, test in the browser, and hit errors. Currently they must: open DevTools, find the error, copy it, paste it into the terminal, explain what happened. This friction happens multiple times per day.

## Solution

A Chrome extension + MCP server that silently captures browser console errors and makes them available to Claude Code via MCP tools. Pull-based: errors are collected passively, Claude queries them when needed.

## Architecture

```
Page script (MAIN world)
  --window.postMessage-->  Content script (ISOLATED world)
    --chrome.runtime.sendMessage-->  Background service worker
      --fetch POST /errors-->  MCP Server (localhost:3777)
        --stdio-->  Claude Code
```

### Chrome Extension

Captures three error types from ALL tabs:
- `console.error()` calls
- Uncaught exceptions (`window.onerror`)
- Unhandled promise rejections (`unhandledrejection`)

**Critical: Content scripts run in an isolated world** and cannot intercept `console.error()` calls made by the page's own code. The extension uses a **MAIN world page script** (`"world": "MAIN"` in manifest) to hook into the page's actual JS context. The page script communicates back to a content script via `window.postMessage()`, which forwards to the background service worker via `chrome.runtime.sendMessage()`. The service worker makes the HTTP POST to localhost — this avoids CSP and mixed-content restrictions that would block fetches from page context.

Each error is POSTed to `localhost:3777/errors` with:
```json
{
  "message": "TypeError: Cannot read property 'x' of undefined",
  "stack": "at App.render (app.js:42:15)\n...",
  "source": "console.error",
  "url": "https://mysite.com/dashboard",
  "line": 42,
  "column": 15,
  "timestamp": "2026-03-24T14:33:15.123Z"
}
```

`source` field is one of: `"console.error"`, `"uncaught_exception"`, `"unhandled_rejection"`.

If the MCP server isn't running, errors are silently dropped. No alerts, no noise.

**Files:**
- `manifest.json` — V3, `<all_urls>` permission, content script (`"run_at": "document_start"`), page script (`"world": "MAIN"`), background service worker
- `page.js` — Runs in MAIN world. Hooks `console.error`, `window.onerror`, `unhandledrejection`. Sends errors via `window.postMessage()`.
- `content.js` — Runs in ISOLATED world. Listens for `window.postMessage`, forwards to background via `chrome.runtime.sendMessage()`.
- `background.js` — Service worker. Receives messages from content script, POSTs to `localhost:3777/errors`. Handles fetch failures silently.
- `popup.html` + `popup.js` — Shows connection status (green/red dot via `GET /health`) and error count. Nothing else.

### MCP Server

Single Node.js/TypeScript process with two responsibilities:

1. **HTTP server (port 3777)** — receives `POST /errors` from the extension, stores in capped in-memory array (max 500, oldest dropped first). Deduplicates: same message + same URL + same line within 5 seconds = increment count instead of new entry. Also exposes `GET /health` returning 200 for the extension popup.
2. **MCP stdio server** — exposes tools to Claude Code via `@modelcontextprotocol/sdk`

If port 3777 is in use, logs a clear error: `Port 3777 already in use. Is another instance running?`

**No database, no config files, no `.env`, no auth.** Localhost-only, no security concern.

### MCP Tools

| Tool | Params | Returns |
|------|--------|---------|
| `get_errors` | `url_filter?` (substring match), `since?` (ISO timestamp or shorthand: "30s", "5m", "1h") | Array of error objects |
| `clear_errors` | `url_filter?` (substring match) | Confirmation + count cleared |
| `get_error_stats` | none | Total count, count per domain, oldest/newest timestamp |

`url_filter` uses **substring matching** — `"localhost"` matches `http://localhost:3000/dashboard`.

`since` shorthand supports: `s` (seconds), `m` (minutes), `h` (hours). Invalid values return an error message.

**Timestamp filtering is critical.** After Claude pushes a fix, it should only look at errors that occurred AFTER the push. The `since` parameter enables this — e.g., `get_errors(since: "2m")` gets errors from the last 2 minutes only.

## User Flow

1. Install MCP server: `npm install -g console-catcher`
2. Add to Claude Code config:
   ```json
   { "mcpServers": { "console-catcher": { "command": "console-catcher" } } }
   ```
3. Install Chrome extension from Web Store (one click)
4. Work normally. Push code, browse site. Errors captured silently.
5. Tell Claude "something broke" — Claude calls `get_errors` and has full context.

## Project Structure

```
console-catcher/
  extension/
    manifest.json
    page.js
    content.js
    background.js
    popup.html
    popup.js
    icon-16.png
    icon-48.png
    icon-128.png
  server/
    index.ts
    package.json
    tsconfig.json
  README.md
  LICENSE
```

## Distribution

- MCP server: npm (`npm install -g console-catcher`)
- Chrome extension: Chrome Web Store ($5 one-time fee)
- Source: GitHub, MIT license
- Listing: PR to modelcontextprotocol/servers

## Design Decisions

1. **Pull-based, not push-based** — MCP tools are request/response. Push would require hacking around the spec and would be fragile.
2. **Capture from ALL tabs** — No coordination between extension and MCP server needed. Claude filters by URL/timestamp when querying. One-way data flow (extension → server only).
3. **In-memory storage, capped at 500** — No persistence needed. Errors are transient debugging data. Cap prevents memory bloat while handling noisy render loops.
4. **Error deduplication** — Same message + URL + line within 5 seconds increments a count rather than creating duplicate entries. Prevents render loop spam from flooding the buffer.
5. **Errors only, no warnings/logs** — Clean signal. `console.warn` and `console.log` are too noisy and rarely useful for bug fixing.
6. **Silent failure** — If MCP server isn't running, extension drops errors quietly. No error dialogs about the error catcher itself.
7. **No config** — Zero configuration. Works out of the box. Port 3777 chosen to avoid conflicts with common dev ports.
8. **MAIN world script injection** — Required because content scripts run in an isolated world and cannot intercept page-level `console.error` calls.
9. **Background service worker for HTTP** — Required because page context cannot reliably fetch to localhost due to CSP and mixed-content restrictions.

## Known Limitations

- **Network/resource loading errors** (e.g., 404 on a `<script>` tag, failed `fetch()`) are NOT captured. Only JS runtime errors and explicit `console.error()` calls are caught. This could be added later via `window.addEventListener("error", ..., true)` in capture phase.

## Success Criteria

- Push a deliberate bug, browse the site, say "something broke" in Claude Code, and Claude has the exact error + stack trace without any manual copy-paste.
- Install takes under 2 minutes.
- Total codebase under 400 lines of actual code.
