import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { startCardPayment } from '~/server/utils/cardPayments'

// Body: { kind: 'checkout' | 'fachschaft_payment', payload, stand_id }.
// The payload is the same CheckoutPayload / FachschaftPayPayload the cash
// endpoints take.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)
  return startCardPayment(current.user, {
    kind: body?.kind,
    payload: body?.payload,
    stand_id: body?.stand_id,
  })
})
