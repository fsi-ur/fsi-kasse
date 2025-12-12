import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }

  const rows = await query(`
    SELECT 
      o.id AS order_id,
      o.fachschaft,
      o.created_at,
      c.id AS cashier_id,
      c.name AS cashier_name,
      i.id AS item_id,
      i.name AS item_name,
      i.price AS item_price,
      i.deposit AS item_deposit,
      oi.quantity
    FROM orders o
    JOIN cashiers c ON o.cashier_id = c.id
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    ORDER BY o.created_at DESC, o.id DESC
  `)

  const data = normalizeBigInt(rows)

  const orders: any[] = []
  for (const row of data) {
    let order = orders.find(o => o.id === row.order_id)
    if (!order) {
      order = {
        id: row.order_id,
        cashier: row.cashier_name,
        is_fachschaft: row.fachschaft,
        created_at: row.created_at,
        items: []
      }
      orders.push(order)
    }
    order.items.push({
      id: row.item_id,
      name: row.item_name,
      price: row.item_price,
      deposit: row.item_deposit,
      quantity: row.quantity
    })
  }

  return { ok: true, orders }
})
