import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
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
    await withTransaction(async (conn) => {
      const insertResult: any = await query(
        `INSERT INTO users (username, password_hash, is_active) VALUES (?, ?, ?)`,
        [username, passwordHash, is_active],
        conn
      )

      const roleRows = await query<{ id: number }[]>(
        `SELECT id FROM roles WHERE code = ? AND is_active = 1 LIMIT 1`,
        [role],
        conn
      )

      if (!roleRows.length) {
        throw new Error('ROLE_NOT_FOUND')
      }

      await query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [Number(insertResult.insertId), Number(roleRows[0]?.id)],
        conn
      )
    })
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'Username already exists' }
    }
    if (err.message === 'ROLE_NOT_FOUND') {
      return { ok: false, error: 'Selected role does not exist' }
    }
    throw err
  }

  return { ok: true }
})
