import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'admin') return { ok: false, error: 'Not authorized' }

  const { name, image } = await readBody(event)
  if (!name) return { ok: false, error: 'Missing fields' }

  await query(`INSERT INTO cashiers (name, image) VALUES (?, ?)`, [name, image])
  return { ok: true }
})