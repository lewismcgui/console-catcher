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
