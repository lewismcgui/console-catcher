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
