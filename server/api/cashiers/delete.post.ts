import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id } = await readBody(event)
  if (!id) return { ok: false, error: 'Missing ID' }

  await query(`DELETE FROM cashiers WHERE id = ?`, [id])
  return { ok: true }
})
