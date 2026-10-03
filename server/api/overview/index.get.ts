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

interface StandFilter {
  orders: string
  donations: string
  params: unknown[]
}

function parseStandFilter(value: unknown): StandFilter | null {
  const raw = value == null ? '' : String(value)
  if (raw === '' || raw === 'all') return { orders: '', donations: '', params: [] }
  if (raw === 'none') return { orders: ' AND o.stand_id IS NULL', donations: ' AND stand_id IS NULL', params: [] }

  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return { orders: ' AND o.stand_id = ?', donations: ' AND stand_id = ?', params: [id] }
}

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

  const stand = parseStandFilter(getQuery(event).standId)
  if (!stand) {
    return { ok: false, error: 'Invalid standId' }
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
      AND o.event_id = ?${stand.orders}
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId, ...stand.params]))

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
      AND o.event_id = ?${stand.orders}
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId, ...stand.params]))

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
      AND o.event_id = ?${stand.orders}
    GROUP BY hour_start
    ORDER BY hour_start ASC
  `, [eventId, ...stand.params]))

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
      AND o.event_id = ?${stand.orders}
  `, [eventId, ...stand.params]))

  const prevHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue,
      SUM(oi.quantity) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.created_at BETWEEN NOW() - INTERVAL 2 HOUR AND NOW() - INTERVAL 1 HOUR
      AND o.event_id = ?${stand.orders}
  `, [eventId, ...stand.params]))

  const lastHourRevenue = Number(lastHourRows[0]?.revenue ?? 0)
  const lastHourQuantity = Number(lastHourRows[0]?.quantity ?? 0)
  const prevHourRevenue = Number(prevHourRows[0]?.revenue ?? 0)
  const prevHourQuantity = Number(prevHourRows[0]?.quantity ?? 0)

  const donationRows = normalizeBigInt(await query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(amount), 0) AS total
    FROM donations
    WHERE event_id = ?${stand.donations}
  `, [eventId, ...stand.params]))

  const donationCount = Number(donationRows[0]?.count ?? 0)
  const donationTotal = Number(donationRows[0]?.total ?? 0)

  const standSalesRows = await query<Array<{ id: unknown, orders: unknown, quantity: unknown, revenue: unknown }>>(`
    SELECT
      o.stand_id AS id,
      COUNT(DISTINCT o.id) AS orders,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * (oi.unit_price + oi.unit_deposit)) AS revenue
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.fachschaft = 0
      AND o.event_id = ?
    GROUP BY o.stand_id
  `, [eventId])

  const standDonationRows = await query<Array<{ id: unknown, total: unknown }>>(`
    SELECT stand_id AS id, SUM(amount) AS total
    FROM donations
    WHERE event_id = ?
    GROUP BY stand_id
  `, [eventId])

  const standNameRows = await query<Array<{ id: unknown, name: unknown }>>(`SELECT id, name FROM stands`)
  const standNames = new Map(standNameRows.map(row => [Number(row.id), String(row.name)]))

  const standKey = (id: unknown) => id == null ? null : Number(id)
  const standsById = new Map<number | null, {
    id: number | null
    name: string | null
    orders: number
    quantity: number
    revenue: number
    donations: number
  }>()
  const standEntry = (id: number | null) => {
    let entry = standsById.get(id)
    if (!entry) {
      entry = { id, name: id == null ? null : (standNames.get(id) ?? null), orders: 0, quantity: 0, revenue: 0, donations: 0 }
      standsById.set(id, entry)
    }
    return entry
  }

  for (const row of standSalesRows) {
    const entry = standEntry(standKey(row.id))
    entry.orders = Number(row.orders ?? 0)
    entry.quantity = Number(row.quantity ?? 0)
    entry.revenue = Number(row.revenue ?? 0)
  }
  for (const row of standDonationRows) {
    standEntry(standKey(row.id)).donations = Number(row.total ?? 0)
  }

  const stands = [...standsById.values()].sort((a, b) => b.revenue - a.revenue)

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
    stands,
    lastHour: {
      revenue: lastHourRevenue,
      quantity: lastHourQuantity,
      diffRevenue: lastHourRevenue - prevHourRevenue,
      diffQuantity: lastHourQuantity - prevHourQuantity,
    }
  }
})
