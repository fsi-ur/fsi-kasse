import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { loadOrderLines, orderMatchesSnapshot, parseChangeText } from '~/server/utils/orderChanges'

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

  return withTransaction(async (conn) => {
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
      const orders = await query<Array<{ id: number, fachschaft: number }>>(
        `SELECT id, fachschaft FROM orders WHERE id = ? FOR UPDATE`,
        [request.order_id],
        conn,
      )
      const order = orders[0]
      if (!order) return { ok: false as const, error: 'Order does not exist' }

      const lines: RequestLineRow[] = normalizeBigInt(await query<RequestLineRow[]>(
        `SELECT version, order_item_id, item_id, item_name, quantity, unit_price, unit_deposit
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
            `INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, unit_deposit)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [order.id, line.item_id, line.item_name, line.quantity, line.unit_price, line.unit_deposit],
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
})
