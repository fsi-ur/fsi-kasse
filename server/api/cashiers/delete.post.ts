import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'admin') return { ok: false, error: 'Not authorized' }

  const { id } = await readBody(event)
  if (!id) return { ok: false, error: 'Missing ID' }

  await query(`DELETE FROM cashiers WHERE id = ?`, [id])
  return { ok: true }
})
