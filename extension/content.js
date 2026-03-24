// Runs in ISOLATED world. Listens for postMessage from page.js,
// forwards to background service worker.

const CHANNEL = '__console_catcher__';

window.addEventListener('message', function (event) {
  if (event.source !== window) return;
  if (!event.data || event.data.channel !== CHANNEL) return;

  chrome.runtime.sendMessage({
    type: 'console-catcher-error',
    payload: event.data.payload,
  }).catch(() => {
    // Service worker may be inactive — that's ok, it'll wake on next message
  });
});
