import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { finalizeCardPayment, serializeCardPayment } from '~/server/utils/cardPayments'
import { CARD_NOT_CONFIGURED_ERROR, isCardConfigured } from '~/server/utils/sumup'

// Asks SumUp again. A failed payment that turns out successful is never booked
// automatically (the customer may have paid cash) but moves to booking_failed;
// `retry_booking: true` re-runs the booking of a booking_failed payment.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current
  if (!isCardConfigured()) return { ok: false, error: CARD_NOT_CONFIGURED_ERROR }

  const body = await readBody(event)
  const clientUuid = normalizeClientUuid(body?.client_uuid)
  if (!clientUuid) return { ok: false, error: 'Missing or invalid client_uuid' }

  const row = await finalizeCardPayment(clientUuid, {
    retryBooking: body?.retry_booking === true,
    recheckFailed: true,
  })
  if (!row) return { ok: false, error: 'Kartenzahlung nicht gefunden' }

  return { ok: true, payment: serializeCardPayment(row) }
})
