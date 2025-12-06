import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { hashPassword } from '~/server/utils/auth'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const current = await getCurrentUserFromEvent(event, { touch: false })
  if (!current) return { ok: false, error: 'Not authenticated' }
  if (current.role !== 'admin') return { ok: false, error: 'Not authorized' }

  const body = await readBody(event)
  const { username, password, role = 'user', is_active = 1 } = body

  if (!username || !password) return { ok: false, error: 'Missing fields' }

  const passwordHash = await hashPassword(password)
  try {
    await query(
      `INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, ?)`,
      [username, passwordHash, role, is_active]
    )
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'Username already exists' }
    }
    throw err
  }

  return { ok: true }
})