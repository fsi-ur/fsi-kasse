import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { canAccessEvent } from '~/server/utils/affiliations'
import { normalizeBigInt } from '~/server/utils/normalize'
import { normalizeLines, resolveBookedLines } from '~/server/utils/checkout'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import { loadOrderLines, parseChangeText } from '~/server/utils/orderChanges'
import {
  checkSellable,
  loadVoucherByCode,
  normalizeVoucherSales,
  resolveVoucherLines,
  utcToBerlinLocal,
  type VoucherCheckContext,
} from '~/server/utils/vouchers'
import { formatVoucherCode } from '~/utils/voucherCode'

// Kept lines of the order: positive line id and quantity, each line at most once.
// Lines of the order that are missing here are removed by the request.
function normalizeKeptLines(value: unknown): Map<number, number> | null {
  if (value == null) return new Map()
  if (!Array.isArray(value)) return null

  const kept = new Map<number, number>()
  for (const entry of value) {
    const id = Number((entry as any)?.order_item_id)
    const quantity = Number((entry as any)?.quantity)
    if (!Number.isInteger(id) || id <= 0) return null
    if (!Number.isInteger(quantity) || quantity <= 0) return null
    if (kept.has(id)) return null
    kept.set(id, quantity)
  }

  return kept
}

// A change request only records the proposed lines; vouchers are not touched
// until the request is approved (review.post.ts), where units and sale state
// are checked under lock.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)

  const orderId = Number(body?.order_id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, error: 'Missing or invalid order_id' }
  }

  const reason = parseChangeText(body?.reason)
  if (reason === undefined) {
    return { ok: false, error: 'Invalid reason' }
  }

  const kept = normalizeKeptLines(body?.lines)
  if (!kept) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const addedLines = normalizeLines(body?.added)
  if (!addedLines) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const addedSales = normalizeVoucherSales(body?.added_voucher_sales)
  if (!addedSales) {
    return { ok: false, error: 'Missing or invalid voucher sales' }
  }

  const resolved = await resolveBookedLines(addedLines)
  if (!resolved.ok) return resolved

  let cashierId: number | null = null
  if (body?.cashier_id != null && body.cashier_id !== '') {
    cashierId = Number(body.cashier_id)
    if (!Number.isInteger(cashierId) || cashierId <= 0 || !(await getCashRegisterCashierById(cashierId))) {
      return { ok: false, error: 'Selected cashier does not exist' }
    }
  }

  const hasProposedLines = kept.size > 0 || resolved.booked.length > 0 || addedSales.length > 0
  const proposedFachschaft = Boolean(body?.is_fachschaft) && hasProposedLines

  const vouchers = await resolveVoucherLines({ lines: resolved.booked, sales: addedSales, isFachschaft: proposedFachschaft })
  if (!vouchers.ok) return vouchers
  const added = [...resolved.booked, ...vouchers.sales]

  const orderRows = normalizeBigInt(await query<Array<{ event_id: number, created_at: string }>>(
    `SELECT event_id, created_at FROM orders WHERE id = ? LIMIT 1`,
    [orderId],
  )) as Array<{ event_id: number, created_at: string }>
  if (!orderRows[0]) return { ok: false, error: 'Order does not exist' }
  if (!await canAccessEvent(current.user, Number(orderRows[0].event_id))) return { ok: false, error: 'Not authorized' }
  const ctx: VoucherCheckContext = { eventId: Number(orderRows[0].event_id), at: utcToBerlinLocal(String(orderRows[0].created_at)) }

  // Checks that don't depend on units: the voucher fits the order's event and
  // date, and a voucher to be sold is still for sale.
  for (const code of new Set(added.filter(line => line.voucher_code).map(line => line.voucher_code!))) {
    const voucher = (await loadVoucherByCode(code))!
    const label = formatVoucherCode(code)
    if (voucher.event_id != null && voucher.event_id !== ctx.eventId) {
      return { ok: false, error: `Gutschein ist für diese Veranstaltung nicht gültig (${label})` }
    }
    if (voucher.valid_until && ctx.at > voucher.valid_until) {
      return { ok: false, error: `Gutschein ist abgelaufen (${label})` }
    }
    if (addedSales.some(sale => sale.code === code)) {
      const problem = checkSellable(voucher, ctx)
      if (problem) return { ok: false, error: `${problem.error} (${label})` }
    } else if (voucher.status === 'revoked') {
      return { ok: false, error: `Gutschein ist gesperrt (${label})` }
    }
  }

  return withTransaction(async (conn) => {
    const orders = normalizeBigInt(await query<Array<{ id: number, event_id: number, fachschaft: number, client_uuid: string | null }>>(
      `SELECT id, event_id, fachschaft, client_uuid FROM orders WHERE id = ? FOR UPDATE`,
      [orderId],
      conn,
    )) as Array<{ id: number, event_id: number, fachschaft: number, client_uuid: string | null }>
    const order = orders[0]
    if (!order) return { ok: false as const, error: 'Order does not exist' }

    const pending = await query<Array<{ id: number }>>(
      `SELECT id FROM order_change_requests WHERE order_id = ? AND status = 'pending' LIMIT 1`,
      [orderId],
      conn,
    )
    if (pending[0]) return { ok: false as const, error: 'A change request for this order is already pending' }

    const originalFachschaft = Boolean(order.fachschaft)
    if (proposedFachschaft && !originalFachschaft) {
      const orderEvent = await getCashRegisterEventById(Number(order.event_id))
      if (!orderEvent?.fachschaft_enabled || !(await getCashRegisterSettings()).fachschaft_enabled) {
        return { ok: false as const, error: 'Fachschaft orders are disabled' }
      }
    }

    const originals = await loadOrderLines(orderId, conn)
    const originalsById = new Map(originals.map(line => [Number(line.id), line]))
    for (const [id, quantity] of kept) {
      const line = originalsById.get(id)
      if (!line) return { ok: false as const, error: 'Unknown item in order' }
      // A sold voucher is one line of one voucher: it can be kept or removed, not multiplied.
      if (line.line_kind === 'voucher_sale' && quantity !== 1) return { ok: false as const, error: 'Missing or invalid order items' }
    }

    if (proposedFachschaft && originals.some(line => kept.has(Number(line.id)) && line.line_kind !== 'item')) {
      return { ok: false as const, error: 'Gutscheine sind in Fachschaftsbestellungen nicht erlaubt' }
    }

    const unchanged = added.length === 0
      && proposedFachschaft === originalFachschaft
      && originals.every(line => kept.get(Number(line.id)) === Number(line.quantity))
    if (unchanged) return { ok: false as const, error: 'The change request does not change the order' }

    const result = await query(
      `INSERT INTO order_change_requests
         (order_id, event_id, order_client_uuid, cashier_id, reason, original_fachschaft, proposed_fachschaft, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, order.event_id, order.client_uuid, cashierId, reason, originalFachschaft ? 1 : 0, proposedFachschaft ? 1 : 0, current.user.username],
      conn,
    )
    const requestId = Number(normalizeBigInt((result as any).insertId))

    const insertLine = (version: 'original' | 'proposed', orderItemId: number | null, line: {
      item_id: number | null
      name: string
      quantity: number
      unit_price: unknown
      unit_deposit: unknown
      line_kind: string
      voucher_id: number | null
      voucher_covers_deposit: unknown
    }) =>
      query(
        `INSERT INTO order_change_request_lines
           (request_id, version, order_item_id, item_id, item_name, quantity, unit_price, unit_deposit,
            line_kind, voucher_id, voucher_covers_deposit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, version, orderItemId, line.item_id, line.name, line.quantity, line.unit_price, line.unit_deposit,
          line.line_kind, line.voucher_id, Number(line.voucher_covers_deposit) ? 1 : 0],
        conn,
      )

    for (const line of originals) {
      const snapshot = {
        item_id: line.item_id,
        name: line.item_name,
        quantity: Number(line.quantity),
        unit_price: line.unit_price,
        unit_deposit: line.unit_deposit,
        line_kind: line.line_kind,
        voucher_id: line.voucher_id,
        voucher_covers_deposit: line.voucher_covers_deposit,
      }
      await insertLine('original', Number(line.id), snapshot)

      const quantity = kept.get(Number(line.id))
      if (quantity) await insertLine('proposed', Number(line.id), { ...snapshot, quantity })
    }

    for (const line of added) {
      await insertLine('proposed', null, line)
    }

    return { ok: true as const, request_id: requestId }
  })
})
