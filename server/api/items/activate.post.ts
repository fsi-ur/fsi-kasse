import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'admin') return { ok: false, error: 'Not authorized' }

  const { id, is_active } = await readBody(event)
  if (id == undefined || is_active == undefined) return { ok: false, error: 'Missing fields' }
  if (is_active != 0 && is_active != 1) return { ok: false, error: 'Illegal value for is_active'}

  await query(`UPDATE items SET is_active = ? WHERE id = ?`, [is_active, id])
  return { ok: true }
})