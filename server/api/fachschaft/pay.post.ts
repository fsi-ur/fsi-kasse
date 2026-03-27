import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, member_id } = await readBody(event)

  if (!cashier_id || !event_id || !member_id) {
    return { ok: false, error: 'Missing payment details' }
  }

  const result = await query(
    `INSERT INTO fachschaft_payments (member_id, cashier_id, event_id) VALUES (?, ?, ?)`,
    [member_id, cashier_id, event_id]
  )

  const payment_id = normalizeBigInt((result as any).insertId)

  return { ok: true, order_id: normalizeBigInt(payment_id) }
})
