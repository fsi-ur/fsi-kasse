import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id, fachschaft_enabled } = await readBody(event)
  if (id == undefined || fachschaft_enabled == undefined) return { ok: false, error: 'Missing fields' }
  if (fachschaft_enabled != 0 && fachschaft_enabled != 1) return { ok: false, error: 'Illegal value for fachschaft_enabled' }

  await query(`UPDATE events SET fachschaft_enabled = ? WHERE id = ?`, [fachschaft_enabled ? 1 : 0, id])
  return { ok: true }
})
