import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { finalizeCardPayment, serializeCardPayment } from '~/server/utils/cardPayments'
import { sumupConfig } from '~/server/utils/sumup'

// Development only (SUMUP_MODE=mock): does what SumUp's webhook would do, for a given payment.
export default defineEventHandler(async (event) => {
  if (sumupConfig().mode !== 'mock') return { ok: false, error: 'Not available' }

  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const clientUuid = normalizeClientUuid((await readBody(event))?.client_uuid)
  if (!clientUuid) return { ok: false, error: 'Missing or invalid client_uuid' }

  const row = await finalizeCardPayment(clientUuid)
  if (!row) return { ok: false, error: 'Kartenzahlung nicht gefunden' }
  return { ok: true, payment: serializeCardPayment(row) }
})
