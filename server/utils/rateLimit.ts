/**
 * A fixed-window in-memory limiter, per process. Good enough to blunt spam
 * against public endpoints; it is not shared between instances.
 */
export function createRateLimiter(options: { limit: number, windowMs: number }) {
  const hits = new Map<string, { count: number, windowStart: number }>()

  return function allow(key: string) {
    const now = Date.now()
    if (hits.size > 10_000) {
      for (const [entryKey, entry] of hits) {
        if (now - entry.windowStart > options.windowMs) hits.delete(entryKey)
      }
    }

    const entry = hits.get(key)
    if (!entry || now - entry.windowStart > options.windowMs) {
      hits.set(key, { count: 1, windowStart: now })
      return true
    }
    entry.count += 1
    return entry.count <= options.limit
  }
}
