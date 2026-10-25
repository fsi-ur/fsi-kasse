import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { cashAmountSql, paymentMethodFilterSql, round2 } from '~/server/utils/checkout'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import { loadCardOverview } from '~/server/utils/cardOverview'
import { loadVoucherOverview } from '~/server/utils/voucherOverview'
import { loadDepositOverview } from '~/server/utils/deposits'

// The per-event sales overview. Shared by the till's own Overview page
// (/api/overview) and the accounting integration API, so both always show
// the same figures.
// Units of an order line that count as handed-out items: a sold voucher and a
// deposit return are not.
const ITEM_QUANTITY_SQL = `IF(oi.line_kind IN ('voucher_sale', 'deposit_return'), 0, oi.quantity)`

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

export interface StandFilter {
  orders: string
  donations: string
  params: unknown[]
}

export function parseStandFilter(value: unknown): StandFilter | null {
  const raw = value == null ? '' : String(value)
  if (raw === '' || raw === 'all') return { orders: '', donations: '', params: [] }
  if (raw === 'none') return { orders: ' AND o.stand_id IS NULL', donations: ' AND stand_id IS NULL', params: [] }

  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return { orders: ' AND o.stand_id = ?', donations: ' AND stand_id = ?', params: [id] }
}

export type EventOverview = Awaited<ReturnType<typeof loadEventOverview>>

export async function loadEventOverview(eventId: number, stand: StandFilter) {
  // All aggregates value the order lines through their own snapshot columns —
  // items is joined only to prefer the item's current name. Sales are valued
  // at the item price only: the deposit is no sale, it is reported in the
  // deposit overview together with the returns that pay it back.
  const regularRows = normalizeBigInt(await query(`
    SELECT
      oi.item_id AS id,
      COALESCE(MAX(i.name), MAX(oi.item_name)) AS name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * oi.unit_price) AS revenue
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN items i ON oi.item_id = i.id
    WHERE o.fachschaft = 0
      AND oi.line_kind = 'item'
      AND o.event_id = ?${stand.orders}
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId, ...stand.params]))

  const regularItems = normalizeBigInt(regularRows)
  const itemsRevenue = regularItems.reduce((sum: number, item: any) => sum + Number(item.revenue), 0)

  const revenueRows = normalizeBigInt(await query(`
    SELECT o.payment_method, IFNULL(SUM(${cashAmountSql()}), 0) AS revenue
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.event_id = ?${stand.orders}
    GROUP BY o.payment_method
  `, [eventId, ...stand.params])) as Array<{ payment_method: string, revenue: unknown }>
  const revenueByMethod = { cash: 0, card: 0 }
  for (const row of revenueRows) revenueByMethod[row.payment_method === 'card' ? 'card' : 'cash'] += Number(row.revenue ?? 0)
  const totalRevenue = revenueByMethod.cash + revenueByMethod.card

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
      AND oi.line_kind = 'item'
      AND o.event_id = ?${stand.orders}
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId, ...stand.params]))

  const fachschaftItems = normalizeBigInt(fachschaftRows)
  const fachschaftTotalWorth = fachschaftItems.reduce((sum: number, item: any) => sum + Number(item.worth), 0)

  const hourlyRows = normalizeBigInt(await query(`
    SELECT
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:00:00') AS hour_start,
      SUM(${cashAmountSql()}) AS revenue,
      SUM(${ITEM_QUANTITY_SQL}) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.event_id = ?${stand.orders}
    GROUP BY hour_start
    ORDER BY hour_start ASC
  `, [eventId, ...stand.params]))

  const hourly = fillHourlyGaps(hourlyRows)

  const paymentRows = await query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(amount), 0) AS revenue,
      IFNULL(SUM(IF(${paymentMethodFilterSql('p', 'cash')}, amount, 0)), 0) AS cash
    FROM fachschaft_payments p
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
  const paymentCash = Number(paymentRows[0]?.cash ?? 0)
  const paymentAmounts = (paymentAmountRows as any[]).map(row => ({
    amount: Number(row.amount),
    count: Number(row.count),
  }))

  const lastHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(${cashAmountSql()}) AS revenue,
      SUM(${ITEM_QUANTITY_SQL}) AS quantity
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.fachschaft = 0
      AND o.created_at >= NOW() - INTERVAL 1 HOUR
      AND o.event_id = ?${stand.orders}
  `, [eventId, ...stand.params]))

  const prevHourRows = normalizeBigInt(await query(`
    SELECT
      SUM(${cashAmountSql()}) AS revenue,
      SUM(${ITEM_QUANTITY_SQL}) AS quantity
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
    SELECT COUNT(*) AS count, IFNULL(SUM(amount), 0) AS total,
      IFNULL(SUM(IF(${paymentMethodFilterSql('d', 'cash')}, amount, 0)), 0) AS cash
    FROM donations d
    WHERE event_id = ?${stand.donations}
  `, [eventId, ...stand.params]))

  const donationCount = Number(donationRows[0]?.count ?? 0)
  const donationTotal = Number(donationRows[0]?.total ?? 0)
  const donationCash = Number(donationRows[0]?.cash ?? 0)

  const standSalesRows = await query<Array<{ id: unknown, orders: unknown, quantity: unknown, revenue: unknown, revenue_card: unknown }>>(`
    SELECT
      o.stand_id AS id,
      COUNT(DISTINCT o.id) AS orders,
      SUM(${ITEM_QUANTITY_SQL}) AS quantity,
      SUM(${cashAmountSql()}) AS revenue,
      SUM(IF(${paymentMethodFilterSql('o', 'card')}, ${cashAmountSql()}, 0)) AS revenue_card
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.fachschaft = 0
      AND o.event_id = ?
    GROUP BY o.stand_id
  `, [eventId])

  const standDonationRows = await query<Array<{ id: unknown, total: unknown, card: unknown }>>(`
    SELECT stand_id AS id, SUM(amount) AS total, SUM(IF(${paymentMethodFilterSql('d', 'card')}, amount, 0)) AS card
    FROM donations d
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
    revenueCard: number
    donations: number
    donationsCard: number
    /** Cash that should be in this stand's drawer: cash sales and cash donations. */
    expectedCash: number
  }>()
  const standEntry = (id: number | null) => {
    let entry = standsById.get(id)
    if (!entry) {
      entry = {
        id,
        name: id == null ? null : (standNames.get(id) ?? null),
        orders: 0,
        quantity: 0,
        revenue: 0,
        revenueCard: 0,
        donations: 0,
        donationsCard: 0,
        expectedCash: 0,
      }
      standsById.set(id, entry)
    }
    return entry
  }

  for (const row of standSalesRows) {
    const entry = standEntry(standKey(row.id))
    entry.orders = Number(row.orders ?? 0)
    entry.quantity = Number(row.quantity ?? 0)
    entry.revenue = Number(row.revenue ?? 0)
    entry.revenueCard = Number(row.revenue_card ?? 0)
  }
  for (const row of standDonationRows) {
    const entry = standEntry(standKey(row.id))
    entry.donations = Number(row.total ?? 0)
    entry.donationsCard = Number(row.card ?? 0)
  }
  for (const entry of standsById.values()) {
    entry.expectedCash = (entry.revenue - entry.revenueCard) + (entry.donations - entry.donationsCard)
  }

  const stands = [...standsById.values()].sort((a, b) => b.revenue - a.revenue)

  const vouchers = await loadVoucherOverview(eventId, stand)
  const deposits = await loadDepositOverview(eventId, stand)
  const card = await loadCardOverview(eventId, (await getCashRegisterSettings()).card_fee_rate)

  // Fachschaft payments have no stand, so they only count towards the drawer of the whole event.
  const includesPayments = stand.params.length === 0 && stand.orders === ''

  return {
    regular: {
      items: regularItems,
      itemsRevenue,
      totalRevenue,
      /** Order revenue without deposits: item sales and voucher sales. */
      salesRevenue: round2(totalRevenue - deposits.netCash),
      /** Deposit cash in the till (taken minus paid back), part of totalRevenue. */
      depositRevenue: deposits.netCash,
      cashRevenue: revenueByMethod.cash,
      cardRevenue: revenueByMethod.card,
    },
    expectedCash: {
      total: revenueByMethod.cash + donationCash + (includesPayments ? paymentCash : 0),
      orders: revenueByMethod.cash,
      donations: donationCash,
      payments: includesPayments ? paymentCash : null,
    },
    card,
    vouchers,
    deposits,
    fachschaft: {
      items: fachschaftItems,
      totalWorth: fachschaftTotalWorth,
    },
    hourly,
    payments: {
      count: paymentCount,
      revenue: paymentRevenue,
      cash: paymentCash,
      card: paymentRevenue - paymentCash,
      amounts: paymentAmounts,
    },
    donations: {
      count: donationCount,
      total: donationTotal,
      cash: donationCash,
      card: donationTotal - donationCash,
    },
    stands,
    lastHour: {
      revenue: lastHourRevenue,
      quantity: lastHourQuantity,
      diffRevenue: lastHourRevenue - prevHourRevenue,
      diffQuantity: lastHourQuantity - prevHourQuantity,
    },
  }
}
