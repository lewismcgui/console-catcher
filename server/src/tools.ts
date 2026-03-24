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
