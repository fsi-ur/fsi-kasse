import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterSettings } from '~/server/utils/appSettings'

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
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * (i.price + IFNULL(i.deposit, 0))) AS worth
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 1
      AND event_id = ?
    GROUP BY i.id
    ORDER BY i.name ASC
  `, [eventId]))

  const fachschaftItems = normalizeBigInt(fachschaftRows)
  const fachschaftTotalWorth = fachschaftItems.reduce((sum: number, item: any) => sum + Number(item.worth), 0)

  const hourlyRows = normalizeBigInt(await query(`
    SELECT
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:00:00') AS hour_start,
      SUM(oi.quantity * (i.price + IFNULL(i.deposit, 0))) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND event_id = ?
    GROUP BY hour_start
    ORDER BY hour_start ASC
  `, [eventId]))

  const hourly = fillHourlyGaps(hourlyRows)

  const paymentRows = await query(`
    SELECT COUNT(*) AS count
    FROM fachschaft_payments
    WHERE event_id = ?
  `, [eventId])

  const settings = await getCashRegisterSettings()
  const paymentCount = Number(paymentRows[0]?.count ?? 0)
  const paymentRevenue = paymentCount * settings.fachschaft_payment_amount

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
