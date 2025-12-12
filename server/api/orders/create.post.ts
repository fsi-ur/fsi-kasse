import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { cashier_id, is_fachschaft = false, items } = await readBody(event)

  if (!cashier_id || !items || items.length === 0) {
    return { ok: false, error: 'Missing order details' }
  }

  const result = await query(
    `INSERT INTO orders (cashier_id, fachschaft) VALUES (?, ?)`,
    [cashier_id, is_fachschaft ? 1 : 0]
  )

  const order_id = normalizeBigInt(result.insertId)

  for (const it of items) {
    await query(
      `INSERT INTO order_items (order_id, item_id, quantity) VALUES (?, ?, ?)`,
      [order_id, it.id, it.quantity]
    )
  }

  return { ok: true, order_id: normalizeBigInt(order_id) }
})