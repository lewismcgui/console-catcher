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
