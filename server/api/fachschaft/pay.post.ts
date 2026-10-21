import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { isDuplicateEntryError, normalizeClientUuid } from '~/server/utils/checkout'
import { isCardPaymentUuid } from '~/server/utils/checkoutBooking'
import {
  bookFachschaftPayment,
  findCommittedFachschaftPayment,
  prepareFachschaftPayment,
} from '~/server/utils/fachschaftPayments'

// Books a cash Fachschaft payment. Card payments go through /api/card-payments/start.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)
  const { client_uuid } = body ?? {}

  // Optional: live callers may omit it, but a value that is present must be valid.
  const clientUuid = client_uuid == null ? null : normalizeClientUuid(client_uuid)
  if (client_uuid != null && !clientUuid) {
    return { ok: false, error: 'Missing or invalid client_uuid' }
  }

  if (clientUuid) {
    if (await isCardPaymentUuid(clientUuid)) {
      return { ok: false, error: 'Diese Zahlung wird bereits per Karte bezahlt' }
    }

    const committed = await findCommittedFachschaftPayment(clientUuid)
    if (committed) return committed
  }

  const prepared = await prepareFachschaftPayment(current.user, body)
  if (!prepared.ok) return prepared
  const { plan } = prepared

  let paymentId
  try {
    paymentId = await bookFachschaftPayment(plan, { clientUuid, paymentMethod: 'cash' })
  } catch (error) {
    if (!clientUuid || !isDuplicateEntryError(error)) throw error

    const replayed = await findCommittedFachschaftPayment(clientUuid)
    if (replayed) return replayed
    throw error
  }

  return {
    ok: true,
    payment_id: paymentId,
    order_id: paymentId,
    amount: plan.amount,
  }
})
