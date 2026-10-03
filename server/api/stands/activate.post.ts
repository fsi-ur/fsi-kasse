import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const isActive = body?.is_active
  if (isActive != 0 && isActive != 1) return { ok: false, error: 'Ungültiger Wert für is_active' }

  const result: any = await query(`UPDATE stands SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, id])
  if (Number(result.affectedRows ?? 0) === 0) return { ok: false, error: 'Stand nicht gefunden' }

  return { ok: true }
})
