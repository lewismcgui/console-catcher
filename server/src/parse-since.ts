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
