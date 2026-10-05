import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { MAX_BATCH_NOTE_LENGTH } from '~/server/utils/vouchers'

// Revoking only blocks further sales and redemptions; the remaining units stay
// as they are, so un-revoking restores the voucher exactly.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return { ok: false, error: 'Bitte einen Grund angeben' }
  if (reason.length > MAX_BATCH_NOTE_LENGTH) return { ok: false, error: 'Der Grund ist zu lang' }

  return withTransaction(async (conn) => {
    const rows = await query<Array<{ status: string }>>(`SELECT status FROM vouchers WHERE id = ? FOR UPDATE`, [id], conn)
    if (!rows[0]) return { ok: false as const, error: 'Gutschein nicht gefunden' }
    if (rows[0].status === 'revoked') return { ok: false as const, error: 'Gutschein ist bereits gesperrt' }

    await query(
      `UPDATE vouchers SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      [current.user.username, reason, id],
      conn,
    )
    return { ok: true as const }
  })
})
