# Console Catcher

Browser console errors, straight to Claude Code.

## The Problem

You push code, test in the browser, something breaks. Currently you have to open DevTools, hunt down the error, copy it, and paste it into the terminal. Console Catcher does this automatically — errors flow from your browser to Claude Code the moment they happen.

## How It Works

```
Browser (Chrome Extension) → localhost:3777 → MCP Server → Claude Code
```

The Chrome extension intercepts console errors and posts them to a local HTTP server. The MCP server exposes those errors as tools that Claude Code can call.

## Install

**1. Install the MCP server:**

```bash
npm install -g console-catcher
```

**2. Add to your Claude Code config** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "console-catcher": {
      "command": "console-catcher"
    }
  }
}
```

**3. Install the Chrome extension:**

Open `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the `extension/` folder from this repo.

## Usage

Browse your site as normal. When something breaks, tell Claude: _"check for errors"_ — it already has them.

### MCP Tools

| Tool | Description |
|------|-------------|
| `get_errors` | Fetch captured errors. Optional: `url_filter` (string), `since` (ISO timestamp) |
| `clear_errors` | Wipe the error buffer |
| `get_error_stats` | Summary counts by error type and URL |

## Why Not Browser Tools MCP?

Browser Tools MCP does 15 things. Console Catcher does one thing well. It's ~250 lines of code, has no config beyond the MCP entry, and no moving parts to break. If all you need is console errors in Claude Code, this is the simpler choice.

## License

MIT
