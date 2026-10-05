import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { round2 } from '~/server/utils/checkout'
import { berlinLocalNow } from '~/server/utils/vouchers'

// Voucher figures of an event for the overview. Sales are revenue; the worth
// of redeemed items is reported separately (like Fachschaft worth) and never
// as revenue — only the deposits customers paid on redeemed items are cash.

/** SQL fragment filtering `orders o` by stand, as built by the overview endpoint. */
interface StandFilter {
  orders: string
  params: unknown[]
}

export async function loadVoucherOverview(eventId: number, stand: StandFilter) {
  const soldRows: any[] = normalizeBigInt(await query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(oi.quantity * oi.unit_price), 0) AS revenue
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.line_kind = 'voucher_sale'
      AND o.event_id = ?${stand.orders}
  `, [eventId, ...stand.params]))

  const redeemedRows: any[] = normalizeBigInt(await query(`
    SELECT
      oi.item_id AS id,
      COALESCE(MAX(i.name), MAX(oi.item_name)) AS name,
      SUM(oi.quantity) AS quantity,
      SUM(oi.quantity * oi.unit_price) AS worth,
      SUM(IF(oi.voucher_covers_deposit = 1, 0, oi.quantity * oi.unit_deposit)) AS deposits,
      SUM(IF(b.kind = 'paid', oi.quantity * oi.unit_price, 0)) AS paid_worth
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN items i ON i.id = oi.item_id
    LEFT JOIN vouchers v ON v.id = oi.voucher_id
    LEFT JOIN voucher_batches b ON b.id = v.batch_id
    WHERE oi.line_kind = 'voucher_redemption'
      AND o.event_id = ?${stand.orders}
    GROUP BY oi.item_id
    ORDER BY name ASC
  `, [eventId, ...stand.params]))

  // Units still open on vouchers usable at this event (and not expired),
  // valued at today's item prices without deposit (see worth above) — an
  // estimate, since the customer picks the items later.
  const outstandingRows: any[] = normalizeBigInt(await query(`
    SELECT
      b.id, b.name, b.kind, b.event_id,
      COUNT(v.id) AS vouchers,
      IFNULL(SUM(v.units_remaining), 0) AS units,
      (
        SELECT AVG(i.price)
        FROM item_group_items gi
        JOIN items i ON i.id = gi.item_id AND i.is_active = 1
        WHERE gi.group_id = b.item_group_id
      ) AS unit_worth
    FROM voucher_batches b
    JOIN vouchers v ON v.batch_id = b.id AND v.status = 'active' AND v.units_remaining > 0
    WHERE (b.event_id = ? OR b.event_id IS NULL)
      AND (b.valid_until IS NULL OR b.valid_until >= ?)
    GROUP BY b.id
    ORDER BY b.name ASC
  `, [eventId, berlinLocalNow()]))

  const redeemedItems = redeemedRows.map(row => ({
    id: row.id == null ? null : Number(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
    worth: round2(Number(row.worth)),
  }))
  const totalWorth = round2(redeemedRows.reduce((sum, row) => sum + Number(row.worth), 0))
  const paidWorth = round2(redeemedRows.reduce((sum, row) => sum + Number(row.paid_worth), 0))

  const outstanding = outstandingRows.map(row => ({
    batch_id: Number(row.id),
    name: String(row.name),
    kind: row.kind as 'paid' | 'free',
    event_bound: row.event_id != null,
    vouchers: Number(row.vouchers),
    units: Number(row.units),
    estimated_worth: round2(Number(row.units) * Number(row.unit_worth ?? 0)),
  }))

  return {
    sold: {
      count: Number(soldRows[0]?.count ?? 0),
      revenue: round2(Number(soldRows[0]?.revenue ?? 0)),
    },
    redeemed: {
      items: redeemedItems,
      totalQuantity: redeemedItems.reduce((sum, item) => sum + item.quantity, 0),
      totalWorth,
      paidWorth,
      freeWorth: round2(totalWorth - paidWorth),
      depositsCollected: round2(redeemedRows.reduce((sum, row) => sum + Number(row.deposits), 0)),
    },
    outstanding,
    outstandingWorth: round2(outstanding.reduce((sum, row) => sum + row.estimated_worth, 0)),
  }
}
