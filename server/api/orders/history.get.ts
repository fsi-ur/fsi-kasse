import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

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
    WHERE event_id = ?
    ORDER BY o.created_at DESC, o.id DESC
  `, [eventId])

  const data = normalizeBigInt(rows)
  const orders: any[] = []

  for (const row of data as any[]) {
    let order = orders.find(entry => entry.id === row.order_id)
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
