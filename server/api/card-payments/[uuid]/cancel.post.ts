import { defineEventHandler, getRouterParam } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { canAccessEvent } from '~/server/utils/affiliations'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { loadCardPayment, serializeCardPayment } from '~/server/utils/cardPayments'
import { sumup } from '~/server/utils/sumup'

// Asks the terminal to stop waiting for the card. Only SumUp's answer moves
// the payment to failed — a card already tapped may still go through.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const clientUuid = normalizeClientUuid(getRouterParam(event, 'uuid'))
  if (!clientUuid) return { ok: false, error: 'Missing or invalid client_uuid' }

  const row = await loadCardPayment(clientUuid)
  if (!row) return { ok: false, error: 'Kartenzahlung nicht gefunden' }
  if (!await canAccessEvent(current.user, Number(row.event_id))) return { ok: false, error: 'Not authorized' }
  if (row.status !== 'processing') return { ok: true, payment: serializeCardPayment(row) }

  const readers = await query<Array<{ sumup_reader_id: string }>>(
    `SELECT sumup_reader_id FROM card_readers WHERE id = ? LIMIT 1`,
    [row.reader_id],
  )
  if (!readers[0]) return { ok: false, error: 'Terminal nicht gefunden' }

  const result = await sumup().terminateReaderCheckout(readers[0].sumup_reader_id)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, payment: serializeCardPayment(row) }
})
