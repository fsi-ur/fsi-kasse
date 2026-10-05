import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { DISPLAY_STATUS_SQL, displayStatus, type VoucherStatus } from '~/server/utils/vouchers'
import { formatVoucherCode } from '~/utils/voucherCode'

const FILTERS: Record<string, string> = DISPLAY_STATUS_SQL

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const params = getQuery(event)
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.batch_id != null && params.batch_id !== '') {
    const batchId = Number(params.batch_id)
    if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige Charge' }
    conditions.push('v.batch_id = ?')
    values.push(batchId)
  }

  if (params.status != null && params.status !== '') {
    const filter = FILTERS[String(params.status)]
    if (!filter) return { ok: false, error: 'Ungültiger Status' }
    conditions.push(filter)
  }

  const rows: any[] = normalizeBigInt(await query<any[]>(
    `SELECT
       v.id, v.code, v.batch_id, b.name AS batch_name, b.kind, v.status, v.units_total, v.units_remaining,
       v.sold_order_id, v.sold_at, v.revoked_at, v.revoked_by, v.revoke_reason, v.created_at
     FROM vouchers v
     JOIN voucher_batches b ON b.id = v.batch_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY v.batch_id DESC, v.id ASC`,
    values,
  ))

  return {
    ok: true,
    vouchers: rows.map(row => ({
      id: Number(row.id),
      code: String(row.code),
      code_formatted: formatVoucherCode(String(row.code)),
      batch_id: Number(row.batch_id),
      batch_name: String(row.batch_name),
      kind: row.kind,
      status: row.status as VoucherStatus,
      display_status: displayStatus(row.status, Number(row.units_remaining)),
      units_total: Number(row.units_total),
      units_remaining: Number(row.units_remaining),
      sold_order_id: row.sold_order_id == null ? null : Number(row.sold_order_id),
      sold_at: row.sold_at,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      revoke_reason: row.revoke_reason,
      created_at: row.created_at,
    })),
  }
})
