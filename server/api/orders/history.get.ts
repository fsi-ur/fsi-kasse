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
      oi.id AS line_id,
      oi.item_id,
      COALESCE(i.name, oi.item_name) AS item_name,
      oi.unit_price AS item_price,
      oi.unit_deposit AS item_deposit,
      oi.quantity
    FROM orders o
    JOIN cashiers c ON o.cashier_id = c.id
    JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN items i ON oi.item_id = i.id
    WHERE o.event_id = ?
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
      // The order-line id, not the item id: item_id is nullable for deleted
      // items and would collide across lines when used as a list key.
      id: row.line_id,
      item_id: row.item_id,
      name: row.item_name,
      price: Number(row.item_price),
      deposit: Number(row.item_deposit),
      quantity: row.quantity
    })
  }

  return { ok: true, orders }
})
