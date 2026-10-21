import { defineEventHandler, getRouterParam } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { canAccessEvent } from '~/server/utils/affiliations'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { finalizeCardPayment, loadCardPayment, serializeCardPayment } from '~/server/utils/cardPayments'

/** Seconds between two SumUp look-ups triggered by polling tills. */
const POLL_CHECK_SECONDS = 3

// The till polls this while it waits. It is also the fallback when no webhook
// arrives: a pending payment that was not checked recently is finalized here.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const clientUuid = normalizeClientUuid(getRouterParam(event, 'uuid'))
  if (!clientUuid) return { ok: false, error: 'Missing or invalid client_uuid' }

  let row = await loadCardPayment(clientUuid)
  if (!row) return { ok: false, error: 'Kartenzahlung nicht gefunden' }
  if (!await canAccessEvent(current.user, Number(row.event_id))) return { ok: false, error: 'Not authorized' }

  const pending = row.status === 'created' || row.status === 'processing'
  const lastChecked = row.last_checked_at ? Date.parse(String(row.last_checked_at).replace(' ', 'T') + 'Z') : 0
  if (pending && Date.now() - lastChecked > POLL_CHECK_SECONDS * 1000) {
    row = (await finalizeCardPayment(clientUuid)) ?? row
  }

  return { ok: true, payment: serializeCardPayment(row) }
})
