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

    let oldest = this.errors[0].timestamp;
    let newest = this.errors[0].timestamp;
    for (const e of this.errors) {
      if (e.timestamp < oldest) oldest = e.timestamp;
      if (e.timestamp > newest) newest = e.timestamp;
    }

    return {
      total: this.errors.length,
      byDomain,
      oldest,
      newest,
    };
  }
}
