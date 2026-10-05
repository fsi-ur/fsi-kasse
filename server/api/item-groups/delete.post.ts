import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const usageRows = await query<Array<{ count: unknown }>>(
    `SELECT COUNT(*) AS count FROM voucher_batches WHERE item_group_id = ?`,
    [id],
  )

  if (Number(usageRows[0]?.count ?? 0) > 0) {
    return {
      ok: false,
      error: 'Die Artikelgruppe wird von Gutscheinchargen verwendet. Deaktiviere sie stattdessen.',
      code: 'item_group_in_use',
    }
  }

  await query(`DELETE FROM item_groups WHERE id = ?`, [id])
  return { ok: true }
})
