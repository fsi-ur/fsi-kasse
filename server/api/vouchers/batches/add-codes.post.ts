import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { insertVouchers, MAX_VOUCHERS_PER_BATCH } from '~/server/utils/voucherCodes'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const batchId = Number(body?.batch_id)
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige ID' }

  const count = Number(body?.count)
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: 'Bitte eine gültige Anzahl eingeben' }

  return withTransaction(async (conn) => {
    const batches = await query<Array<{ kind: string, units_per_voucher: unknown }>>(
      `SELECT kind, units_per_voucher FROM voucher_batches WHERE id = ? FOR UPDATE`,
      [batchId],
      conn,
    )
    const batch = batches[0]
    if (!batch) return { ok: false as const, error: 'Charge nicht gefunden' }

    const existing = await query<Array<{ count: unknown }>>(`SELECT COUNT(*) AS count FROM vouchers WHERE batch_id = ?`, [batchId], conn)
    const total = Number(existing[0]?.count ?? 0) + count
    if (total > MAX_VOUCHERS_PER_BATCH) {
      return { ok: false as const, error: `Eine Charge kann höchstens ${MAX_VOUCHERS_PER_BATCH} Gutscheine enthalten` }
    }

    await insertVouchers({
      id: batchId,
      status: batch.kind === 'free' ? 'active' : 'unsold',
      units: Number(batch.units_per_voucher),
    }, count, conn)

    return { ok: true as const, total }
  })
})
