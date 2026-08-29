/**
 * A fixed-window counter per key, held in memory. On serverless each instance
 * keeps its own counts, so this bounds abuse of one instance rather than the
 * whole deployment. Good enough to stop a runaway client; not a billing control.
 */
export type RateLimit = {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
};

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export function isRateLimited(key: string, rule: RateLimit, now = Date.now()): boolean {
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return false;
  }

  current.count += 1;
  return current.count > rule.limit;
}

export function clearRateLimits(): void {
  windows.clear();
}

/** The caller's address as Vercel reports it; "unknown" rather than one shared bucket. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
