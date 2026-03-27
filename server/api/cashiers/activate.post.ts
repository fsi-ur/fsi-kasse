import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id, is_active } = await readBody(event)
  if (id == undefined || is_active == undefined) return { ok: false, error: 'Missing fields' }
  if (is_active != 0 && is_active != 1) return { ok: false, error: 'Illegal value for is_active' }

  await query(`UPDATE cashiers SET is_active = ? WHERE id = ?`, [is_active, id])
  return { ok: true }
})
