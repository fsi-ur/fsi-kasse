import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Missing ID' }

  const usageRows = await query<Array<{ count: unknown }>>(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE stand_id = ?)
       + (SELECT COUNT(*) FROM donations WHERE stand_id = ?) AS count`,
    [id, id],
  )

  if (Number(usageRows[0]?.count ?? 0) > 0) {
    return { ok: false, error: 'Stand is used by existing orders', code: 'stand_in_use' }
  }

  await query(`DELETE FROM stands WHERE id = ?`, [id])
  return { ok: true }
})
