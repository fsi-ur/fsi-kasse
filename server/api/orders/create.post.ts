import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, is_fachschaft = false, items } = await readBody(event)

  if (!cashier_id || !event_id || !items || items.length === 0) {
    return { ok: false, error: 'Missing order details' }
  }

  const result = await query(
    `INSERT INTO orders (cashier_id, event_id, fachschaft) VALUES (?, ?, ?)`,
    [cashier_id, event_id, is_fachschaft ? 1 : 0]
  )

  const order_id = normalizeBigInt((result as any).insertId)

  for (const item of items) {
    await query(
      `INSERT INTO order_items (order_id, item_id, quantity) VALUES (?, ?, ?)`,
      [order_id, item.id, item.quantity]
    )
  }

  return { ok: true, order_id: normalizeBigInt(order_id) }
})
