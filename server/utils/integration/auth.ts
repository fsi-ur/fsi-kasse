import { createHash, timingSafeEqual } from 'node:crypto'
import { getHeader, type H3Event } from 'h3'

// Server-to-server access for the accounting app (Buchhaltung). One shared
// secret, set as INTEGRATION_API_KEY here and as CASH_REGISTER_API_KEY there.
// It never reaches a browser: the Buchhaltung calls these endpoints from its
// own server after checking its user's permission.
const MIN_KEY_LENGTH = 32

function configuredKey() {
  const key = (process.env.INTEGRATION_API_KEY || '').trim()
  return key.length >= MIN_KEY_LENGTH ? key : null
}

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export function requireIntegrationKey(event: H3Event) {
  const expected = configuredKey()
  if (!expected) return { ok: false as const, error: 'Integration API disabled' }

  const header = getHeader(event, 'authorization') || ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  // Comparing digests keeps the comparison constant-time regardless of length.
  if (!given || !timingSafeEqual(digest(given), digest(expected))) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  return { ok: true as const }
}
