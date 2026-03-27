import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

  const regularRows = normalizeBigInt(await query(`
    SELECT
      i.id,
      i.name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * (i.price + IFNULL(i.deposit, 0))) AS revenue
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND event_id = ?
    GROUP BY i.id
    ORDER BY i.name ASC
  `, [eventId]))

  const regularItems = normalizeBigInt(regularRows)
  const totalRevenue = regularItems.reduce((sum: number, item: any) => sum + Number(item.revenue), 0)

  const fachschaftRows = normalizeBigInt(await query(`
    SELECT
      i.id,
      i.name,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 1
      AND event_id = ?
    GROUP BY i.id
    ORDER BY i.name ASC
  `, [eventId]))

  const fachschaftItems = normalizeBigInt(fachschaftRows)

  const paymentRows = await query(`
    SELECT COUNT(*) AS count
    FROM fachschaft_payments
    WHERE event_id = ?
  `, [eventId])

  const paymentCount = Number(paymentRows[0]?.count ?? 0)
  const paymentRevenue = paymentCount * 10

  const lastHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(oi.quantity * (i.price + IFNULL(i.deposit, 0))) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND o.created_at >= NOW() - INTERVAL 1 HOUR
      AND event_id = ?
  `, [eventId]))

  const prevHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(oi.quantity * (i.price + IFNULL(i.deposit, 0))) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND o.created_at BETWEEN NOW() - INTERVAL 2 HOUR AND NOW() - INTERVAL 1 HOUR
      AND event_id = ?
  `, [eventId]))

  const lastHourRevenue = Number(lastHourRows[0]?.revenue ?? 0)
  const lastHourQuantity = Number(lastHourRows[0]?.quantity ?? 0)
  const prevHourRevenue = Number(prevHourRows[0]?.revenue ?? 0)
  const prevHourQuantity = Number(prevHourRows[0]?.quantity ?? 0)

  return {
    ok: true,
    regular: {
      items: regularItems,
      totalRevenue,
    },
    fachschaft: {
      items: fachschaftItems,
    },
    payments: {
      count: paymentCount,
      revenue: paymentRevenue,
    },
    lastHour: {
      revenue: lastHourRevenue,
      quantity: lastHourQuantity,
      diffRevenue: lastHourRevenue - prevHourRevenue,
      diffQuantity: lastHourQuantity - prevHourQuantity,
    }
  }
})
