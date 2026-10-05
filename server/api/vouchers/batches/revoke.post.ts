import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { DISPLAY_STATUS_SQL, MAX_BATCH_NOTE_LENGTH, type VoucherDisplayStatus } from '~/server/utils/vouchers'

const REVOCABLE: VoucherDisplayStatus[] = ['unsold', 'active', 'used_up']

// Revokes every voucher of a batch that currently has one of the chosen display
// statuses. Like a single revocation it only blocks further sales and
// redemptions, so each voucher can still be un-revoked on its own. The UPDATE
// locks the rows in index (batch_id, id) order, i.e. ascending id like checkout.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const batchId = Number(body?.batch_id)
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige Charge' }

  const statuses = Array.isArray(body?.statuses) ? [...new Set(body.statuses.map(String))] : []
  if (!statuses.length || statuses.some(status => !REVOCABLE.includes(status as VoucherDisplayStatus))) {
    return { ok: false, error: 'Bitte mindestens einen gültigen Status wählen' }
  }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return { ok: false, error: 'Bitte einen Grund angeben' }
  if (reason.length > MAX_BATCH_NOTE_LENGTH) return { ok: false, error: 'Der Grund ist zu lang' }

  return withTransaction(async (conn) => {
    const batches = await query<Array<{ id: number }>>(`SELECT id FROM voucher_batches WHERE id = ? FOR UPDATE`, [batchId], conn)
    if (!batches[0]) return { ok: false as const, error: 'Charge nicht gefunden' }

    const filter = statuses.map(status => `(${DISPLAY_STATUS_SQL[status as VoucherDisplayStatus]})`).join(' OR ')
    const result = await query<{ affectedRows: number }>(
      `UPDATE vouchers v
       SET v.status = 'revoked', v.revoked_at = CURRENT_TIMESTAMP, v.revoked_by = ?, v.revoke_reason = ?
       WHERE v.batch_id = ? AND (${filter})`,
      [current.user.username, reason, batchId],
      conn,
    )
    return { ok: true as const, count: Number(result.affectedRows ?? 0) }
  })
})
