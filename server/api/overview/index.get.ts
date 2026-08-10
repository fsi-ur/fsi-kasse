import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

interface HourlyEntry {
  hour: string
  revenue: number
  quantity: number
}

// Builds a continuous hour-by-hour series from the first to the last sale of
// the event, so events of any length chart correctly including quiet hours.
function fillHourlyGaps(rows: Array<{ hour_start: string, revenue: unknown, quantity: unknown }>): HourlyEntry[] {
  if (!rows.length) return []

  const byHour = new Map(rows.map(row => [row.hour_start, row]))
  const toTime = (value: string) => new Date(value.replace(' ', 'T') + 'Z').getTime()
  const toKey = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ')

  const firstTime = toTime(rows[0]!.hour_start)
  const lastTime = toTime(rows[rows.length - 1]!.hour_start)
  const hourMs = 60 * 60 * 1000

  const result: HourlyEntry[] = []
  for (let time = firstTime; time <= lastTime; time += hourMs) {
    const row = byHour.get(toKey(time))
    result.push({
      hour: toKey(time),
      revenue: Number(row?.revenue ?? 0),
      quantity: Number(row?.quantity ?? 0),
    })
  }

  return result
}

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

  // All aggregates value the order lines through their own snapshot columns —
  // items is joined only to prefer the item's current name.
  const regularRows = normalizeBigInt(await query(`
    SELECT
      oi.item_id AS id,
      COALESCE(MAX(i.name), MAX(oi.item_name)) AS name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND o.event_id = ?
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId]))

  const regularItems = normalizeBigInt(regularRows)
  const totalRevenue = regularItems.reduce((sum: number, item: any) => sum + Number(item.revenue), 0)

  // Items given out to the Fachschaft are never paid for — no deposit changes
  // hands either, so the worth is the price only, unlike regular sales.
  const fachschaftRows = normalizeBigInt(await query(`
    SELECT
      oi.item_id AS id,
      COALESCE(MAX(i.name), MAX(oi.item_name)) AS name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * oi.unit_price) AS worth
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 1
      AND o.event_id = ?
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId]))

  const fachschaftItems = normalizeBigInt(fachschaftRows)
  const fachschaftTotalWorth = fachschaftItems.reduce((sum: number, item: any) => sum + Number(item.worth), 0)

  const hourlyRows = normalizeBigInt(await query(`
    SELECT
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:00:00') AS hour_start,
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.event_id = ?
    GROUP BY hour_start
    ORDER BY hour_start ASC
  `, [eventId]))

  const hourly = fillHourlyGaps(hourlyRows)

  const paymentRows = await query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(amount), 0) AS revenue
    FROM fachschaft_payments
    WHERE event_id = ?
  `, [eventId])

  const paymentAmountRows = normalizeBigInt(await query(`
    SELECT amount, COUNT(*) AS count
    FROM fachschaft_payments
    WHERE event_id = ?
    GROUP BY amount
    ORDER BY amount ASC
  `, [eventId]))

  const paymentCount = Number(paymentRows[0]?.count ?? 0)
  const paymentRevenue = Number(paymentRows[0]?.revenue ?? 0)
  const paymentAmounts = (paymentAmountRows as any[]).map(row => ({
    amount: Number(row.amount),
    count: Number(row.count),
  }))

  const lastHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.created_at >= NOW() - INTERVAL 1 HOUR
      AND o.event_id = ?
  `, [eventId]))

  const prevHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.created_at BETWEEN NOW() - INTERVAL 2 HOUR AND NOW() - INTERVAL 1 HOUR
      AND o.event_id = ?
  `, [eventId]))

  const lastHourRevenue = Number(lastHourRows[0]?.revenue ?? 0)
  const lastHourQuantity = Number(lastHourRows[0]?.quantity ?? 0)
  const prevHourRevenue = Number(prevHourRows[0]?.revenue ?? 0)
  const prevHourQuantity = Number(prevHourRows[0]?.quantity ?? 0)

  const donationRows = normalizeBigInt(await query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(amount), 0) AS total
    FROM donations
    WHERE event_id = ?
  `, [eventId]))

  const donationCount = Number(donationRows[0]?.count ?? 0)
  const donationTotal = Number(donationRows[0]?.total ?? 0)

  return {
    ok: true,
    regular: {
      items: regularItems,
      totalRevenue,
    },
    fachschaft: {
      items: fachschaftItems,
      totalWorth: fachschaftTotalWorth,
    },
    hourly,
    payments: {
      count: paymentCount,
      revenue: paymentRevenue,
      amounts: paymentAmounts,
    },
    donations: {
      count: donationCount,
      total: donationTotal,
    },
    lastHour: {
      revenue: lastHourRevenue,
      quantity: lastHourQuantity,
      diffRevenue: lastHourRevenue - prevHourRevenue,
      diffQuantity: lastHourQuantity - prevHourQuantity,
    }
  }
})
