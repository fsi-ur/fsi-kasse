import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { canAccessEvent } from '~/server/utils/affiliations'
import { normalizeBigInt } from '~/server/utils/normalize'
import { loadChangeRequests, type OrderChangeRequest } from '~/server/utils/orderChanges'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }
  if (!await canAccessEvent(current.user, eventId)) return { ok: false, error: 'Not authorized' }

  const rows = await query(`
    SELECT 
      o.id AS order_id,
      o.fachschaft,
      o.created_at,
      c.id AS cashier_id,
      c.name AS cashier_name,
      s.name AS stand_name,
      oi.id AS line_id,
      oi.item_id,
      COALESCE(i.name, oi.item_name) AS item_name,
      oi.unit_price AS item_price,
      oi.unit_deposit AS item_deposit,
      oi.quantity,
      oi.line_kind,
      oi.voucher_covers_deposit,
      v.code AS voucher_code
    FROM orders o
    JOIN cashiers c ON o.cashier_id = c.id
    JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN items i ON oi.item_id = i.id
    LEFT JOIN vouchers v ON v.id = oi.voucher_id
    LEFT JOIN stands s ON s.id = o.stand_id
    WHERE o.event_id = ?
    ORDER BY o.created_at DESC, o.id DESC
  `, [eventId])

  const donationRows = normalizeBigInt(await query(`
    SELECT
      d.id,
      d.order_id,
      d.amount,
      d.created_at,
      c.name AS cashier_name,
      s.name AS stand_name
    FROM donations d
    JOIN cashiers c ON d.cashier_id = c.id
    LEFT JOIN stands s ON s.id = d.stand_id
    WHERE d.event_id = ?
  `, [eventId])) as any[]

  const donationByOrder = new Map<number, number>()
  const directDonations: any[] = []
  for (const row of donationRows) {
    if (row.order_id != null) {
      donationByOrder.set(row.order_id, (donationByOrder.get(row.order_id) ?? 0) + Number(row.amount))
    } else {
      // Donations without an order get their own entry
      directDonations.push({
        id: null,
        donation_id: row.id,
        cashier: row.cashier_name,
        stand: row.stand_name ?? null,
        is_fachschaft: 0,
        created_at: row.created_at,
        donation: Number(row.amount),
        items: []
      })
    }
  }

  const changeRequestByOrder = new Map<number, OrderChangeRequest>()
  for (const request of await loadChangeRequests({ eventId }, false)) {
    const latest = changeRequestByOrder.get(request.order_id)
    if (!latest || request.id > latest.id) changeRequestByOrder.set(request.order_id, request)
  }

  const data = normalizeBigInt(rows)
  const orders: any[] = []
  const ordersById = new Map<number, any>()

  for (const row of data as any[]) {
    let order = ordersById.get(row.order_id)
    if (!order) {
      order = {
        id: row.order_id,
        cashier: row.cashier_name,
        stand: row.stand_name ?? null,
        is_fachschaft: row.fachschaft,
        created_at: row.created_at,
        donation: donationByOrder.get(row.order_id) ?? 0,
        change_request: changeRequestByOrder.get(row.order_id) ?? null,
        items: []
      }
      ordersById.set(row.order_id, order)
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
      quantity: row.quantity,
      line_kind: row.line_kind ?? 'item',
      voucher_code: row.voucher_code ?? null,
      voucher_covers_deposit: Boolean(Number(row.voucher_covers_deposit)),
    })
  }

  orders.push(...directDonations)
  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return { ok: true, orders }
})
