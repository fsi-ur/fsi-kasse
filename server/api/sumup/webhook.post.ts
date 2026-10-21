import { timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getQuery, getRequestIP } from 'h3'
import { query } from '~/server/utils/db'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { finalizeCardPayment } from '~/server/utils/cardPayments'
import { createRateLimiter } from '~/server/utils/rateLimit'

const allow = createRateLimiter({ limit: 60, windowMs: 60_000 })

function tokensMatch(expected: string, given: string) {
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Public: SumUp POSTs here (the return_url of a checkout). SumUp documents no
// signature, so the body is never trusted — the call only triggers a fresh
// look-up of the transaction. The per-payment token in the URL keeps random
// callers from making us poll SumUp. Always answers 200 {} so nothing leaks.
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!allow(ip)) return {}

  const params = getQuery(event)
  const clientUuid = normalizeClientUuid(params.p)
  const token = typeof params.t === 'string' ? params.t : ''
  if (!clientUuid || !token) return {}

  const rows = await query<Array<{ webhook_token: string }>>(
    `SELECT webhook_token FROM card_payments WHERE client_uuid = ? LIMIT 1`,
    [clientUuid],
  )
  if (!rows[0] || !tokensMatch(String(rows[0].webhook_token), token)) return {}

  try {
    await finalizeCardPayment(clientUuid)
  } catch (error) {
    console.error('[sumup] webhook finalize failed', clientUuid, error)
  }
  return {}
})
