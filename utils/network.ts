export const OFFLINE_REQUEST_TIMEOUT_MS = 8000

const RETRYABLE_STATUSES = new Set([0, 500, 502, 503, 504])

/**
 * Decides whether a failed request is worth retrying later (server unreachable
 * or broken) or is a final answer. Handlers return `{ ok: false }` for every
 * known error, so a body like that — or any 4xx — is a business answer, while
 * no response at all, a timeout or a 5xx means the server could not answer.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const error = err as { response?: { status?: number }, data?: unknown, name?: string, statusCode?: number }
  const data = error.data as { ok?: unknown } | undefined
  if (data && typeof data === 'object' && data.ok === false) return false

  if (!error.response) {
    // ofetch wraps network failures and aborts in a FetchError without a
    // response; a bare TypeError is what fetch() itself throws offline.
    return err instanceof TypeError
      || error.name === 'FetchError'
      || error.name === 'AbortError'
      || error.name === 'TimeoutError'
  }

  const status = Number(error.response.status ?? error.statusCode ?? 0)
  return RETRYABLE_STATUSES.has(status)
}

/** `crypto.randomUUID` only exists in secure contexts; fall back to getRandomValues. */
export function createClientUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
