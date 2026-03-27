import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const rows = await query(`
    SELECT id, name, is_active
    FROM events 
    ORDER BY name ASC
  `)

  return { ok: true, events: normalizeBigInt(rows) }
})
