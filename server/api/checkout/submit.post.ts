import { defineEventHandler, readBody } from 'h3'
import { withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { findCommittedCheckout, isDuplicateEntryError, normalizeClientUuid } from '~/server/utils/checkout'
import { bookCheckout, isCardPaymentUuid, prepareCheckout } from '~/server/utils/checkoutBooking'
import { berlinLocalNow, VoucherBookingError } from '~/server/utils/vouchers'

// Books a whole cash checkout (order and optional donation) atomically. Every
// request carries a client-generated UUID, so the offline queue can replay it
// safely. Card checkouts go through /api/card-payments/start instead.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)

  const clientUuid = normalizeClientUuid(body?.client_uuid)
  if (!clientUuid) {
    return { ok: false, error: 'Missing or invalid client_uuid' }
  }

  if (await isCardPaymentUuid(clientUuid)) {
    return { ok: false, error: 'Diese Bestellung wird bereits per Karte bezahlt' }
  }

  const committed = await findCommittedCheckout(clientUuid)
  if (committed) return committed

  const prepared = await prepareCheckout(current.user, body)
  if (!prepared.ok) return prepared
  const { plan } = prepared

  try {
    const { orderId } = await withTransaction(conn => bookCheckout(plan, {
      clientUuid,
      paymentMethod: 'cash',
      at: berlinLocalNow(),
    }, conn))

    return { ok: true, order_id: orderId, total: plan.total, lines: plan.booked, donation_amount: plan.donationAmount }
  } catch (error) {
    if (error instanceof VoucherBookingError) return { ok: false, error: error.message }
    if (!isDuplicateEntryError(error)) throw error

    const replayed = await findCommittedCheckout(clientUuid)
    if (replayed) return replayed
    throw error
  }
})
