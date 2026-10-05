import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { loadOrderLines, orderMatchesSnapshot, parseChangeText } from '~/server/utils/orderChanges'
import {
  addVoucherDelta,
  applyVoucherDeltas,
  utcToBerlinLocal,
  VoucherBookingError,
  type VoucherDelta,
} from '~/server/utils/vouchers'

interface RequestRow {
  id: number
  order_id: number
  status: string
  original_fachschaft: number
  proposed_fachschaft: number
}

interface RequestLineRow {
  version: 'original' | 'proposed'
  order_item_id: number | null
  item_id: number | null
  item_name: string
  quantity: number
  unit_price: string | number
  unit_deposit: string | number
  line_kind: 'item' | 'voucher_redemption' | 'voucher_sale'
  voucher_id: number | null
  voucher_covers_deposit: number
}

/**
 * What approving the change does to vouchers: reduced or removed redemptions
 * give units back, added ones take units, a removed sale takes the voucher
 * back (only while it is untouched), an added sale sells it.
 */
function voucherDeltas(original: RequestLineRow[], proposed: RequestLineRow[]) {
  const deltas = new Map<number, VoucherDelta>()
  const proposedByOrderItem = new Map(proposed
    .filter(line => line.order_item_id != null)
    .map(line => [Number(line.order_item_id), line]))

  for (const line of original) {
    if (line.voucher_id == null) continue
    const after = proposedByOrderItem.get(Number(line.order_item_id))
    if (line.line_kind === 'voucher_redemption') {
      const change = Number(after?.quantity ?? 0) - Number(line.quantity)
      if (change !== 0) addVoucherDelta(deltas, Number(line.voucher_id), { unitsConsumed: change })
    } else if (line.line_kind === 'voucher_sale' && !after) {
      addVoucherDelta(deltas, Number(line.voucher_id), { unsell: true })
    }
  }

  for (const line of proposed) {
    if (line.order_item_id != null || line.voucher_id == null) continue
    if (line.line_kind === 'voucher_redemption') addVoucherDelta(deltas, Number(line.voucher_id), { unitsConsumed: Number(line.quantity) })
    else if (line.line_kind === 'voucher_sale') addVoucherDelta(deltas, Number(line.voucher_id), { sell: true })
  }

  return deltas
}

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)

  const requestId = Number(body?.id)
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return { ok: false, error: 'Missing or invalid change request id' }
  }

  const decision = body?.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, error: 'Missing or invalid decision' }
  }

  const note = parseChangeText(body?.note)
  if (note === undefined) {
    return { ok: false, error: 'Missing or invalid note' }
  }

  try {
    return await withTransaction(async (conn) => {
      const requests: RequestRow[] = normalizeBigInt(await query<RequestRow[]>(
        `SELECT id, order_id, status, original_fachschaft, proposed_fachschaft
         FROM order_change_requests
         WHERE id = ?
         FOR UPDATE`,
        [requestId],
        conn,
      ))
      const request = requests[0]
      if (!request) return { ok: false as const, error: 'Change request does not exist' }
      if (request.status !== 'pending') return { ok: false as const, error: 'Change request has already been reviewed' }

      if (decision === 'approve') {
        const orders = await query<Array<{ id: number, fachschaft: number, event_id: unknown, created_at: unknown }>>(
          `SELECT id, fachschaft, event_id, created_at FROM orders WHERE id = ? FOR UPDATE`,
          [request.order_id],
          conn,
        )
        const order = orders[0]
        if (!order) return { ok: false as const, error: 'Order does not exist' }

        const lines: RequestLineRow[] = normalizeBigInt(await query<RequestLineRow[]>(
          `SELECT version, order_item_id, item_id, item_name, quantity, unit_price, unit_deposit,
             line_kind, voucher_id, voucher_covers_deposit
           FROM order_change_request_lines
           WHERE request_id = ?
           ORDER BY id`,
          [requestId],
          conn,
        ))
        const original = lines.filter(line => line.version === 'original')
        const proposed = lines.filter(line => line.version === 'proposed')

        const currentLines = await loadOrderLines(Number(order.id), conn)
        const matches = orderMatchesSnapshot(
          { fachschaft: Boolean(order.fachschaft), lines: currentLines },
          { fachschaft: Boolean(request.original_fachschaft), lines: original },
        )
        if (!matches) return { ok: false as const, error: 'The order has changed since the change request was made' }

        // A voucher deleted after the request was made leaves its line without a voucher.
        if (proposed.some(line => line.line_kind !== 'item' && line.voucher_id == null)) {
          return { ok: false as const, error: 'Gutschein nicht gefunden' }
        }

        // Vouchers first: a full cancellation deletes the order lines by cascade,
        // and the units they hold must be given back before that. The change
        // corrects a past sale, so validity is judged as of the order.
        await applyVoucherDeltas(
          voucherDeltas(original, proposed),
          { eventId: Number(order.event_id), at: utcToBerlinLocal(String(order.created_at)) },
          conn,
          Number(order.id),
        )

        if (proposed.length === 0) {
          await query(`DELETE FROM orders WHERE id = ?`, [order.id], conn)
        } else {
          const keptQuantities = new Map(proposed
            .filter(line => line.order_item_id != null)
            .map(line => [Number(line.order_item_id), Number(line.quantity)]))

          for (const line of currentLines) {
            const quantity = keptQuantities.get(Number(line.id))
            if (quantity == null) {
              await query(`DELETE FROM order_items WHERE id = ? AND order_id = ?`, [line.id, order.id], conn)
            } else if (quantity !== Number(line.quantity)) {
              await query(`UPDATE order_items SET quantity = ? WHERE id = ? AND order_id = ?`, [quantity, line.id, order.id], conn)
            }
          }

          for (const line of proposed.filter(line => line.order_item_id == null)) {
            await query(
              `INSERT INTO order_items
                 (order_id, item_id, item_name, quantity, unit_price, unit_deposit, line_kind, voucher_id, voucher_covers_deposit)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [order.id, line.item_id, line.item_name, line.quantity, line.unit_price, line.unit_deposit,
                line.line_kind, line.voucher_id, line.voucher_covers_deposit ? 1 : 0],
              conn,
            )
          }

          await query(`UPDATE orders SET fachschaft = ? WHERE id = ?`, [request.proposed_fachschaft ? 1 : 0, order.id], conn)
        }
      }

      await query(
        `UPDATE order_change_requests
         SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
         WHERE id = ?`,
        [decision === 'approve' ? 'approved' : 'rejected', current.user.username, note, requestId],
        conn,
      )

      return { ok: true as const }
    })
  } catch (error) {
    if (error instanceof VoucherBookingError) return { ok: false, error: error.message }
    throw error
  }
})
