import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { cashier_id, member_id } = await readBody(event)

  if (!cashier_id || !member_id) {
    return { ok: false, error: 'Missing payment details' }
  }

  const result = await query(
    `INSERT INTO fachschaft_payments (member_id, cashier_id) VALUES (?, ?)`,
    [member_id, cashier_id]
  )

  const payment_id = normalizeBigInt(result.insertId)

  return { ok: true, order_id: normalizeBigInt(payment_id) }
})