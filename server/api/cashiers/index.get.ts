import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }

  const rows = await query(`
    SELECT id, name, image, is_active
    FROM cashiers 
    ORDER BY name ASC
  `)

  return { ok: true, cashiers: normalizeBigInt(rows) }
})