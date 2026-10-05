import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { batchInUse } from '~/server/utils/vouchers'

// Only an untouched batch can be deleted.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  return withTransaction(async (conn) => {
    const rows = await query<Array<{ id: unknown }>>(`SELECT id FROM voucher_batches WHERE id = ? FOR UPDATE`, [id], conn)
    if (!rows[0]) return { ok: false as const, error: 'Charge nicht gefunden' }

    if (await batchInUse(id, conn)) {
      return {
        ok: false as const,
        error: 'Gutscheine dieser Charge wurden bereits verkauft oder eingelöst. Sperre die Gutscheine stattdessen.',
        code: 'batch_in_use',
      }
    }

    await query(`DELETE FROM voucher_batches WHERE id = ?`, [id], conn)
    return { ok: true as const }
  })
})
