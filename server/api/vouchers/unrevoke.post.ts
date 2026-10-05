import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

// Restores the status the voucher had before it was revoked: a paid voucher
// that was never sold goes back to `unsold`, everything else to `active`.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  return withTransaction(async (conn) => {
    const rows = await query<Array<{ status: string, sold_order_id: unknown, kind: string }>>(
      `SELECT v.status, v.sold_order_id, b.kind
       FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
       WHERE v.id = ? FOR UPDATE`,
      [id],
      conn,
    )
    const voucher = rows[0]
    if (!voucher) return { ok: false as const, error: 'Gutschein nicht gefunden' }
    if (voucher.status !== 'revoked') return { ok: false as const, error: 'Gutschein ist nicht gesperrt' }

    const status = voucher.kind === 'paid' && voucher.sold_order_id == null ? 'unsold' : 'active'
    await query(
      `UPDATE vouchers SET status = ?, revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE id = ?`,
      [status, id],
      conn,
    )
    return { ok: true as const, status }
  })
})
