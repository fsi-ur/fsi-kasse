import { defineEventHandler, readBody } from 'h3'
import { hashPassword } from '~/server/utils/auth'
import { accountingQuery, isConnectedAccountingMode, withAccountingTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { getRoleIdByCode } from '~/server/utils/roles'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  const body = await readBody(event)
  const { username, password, role = 'user', is_active = 1 } = body

  if (!username || !password) return { ok: false, error: 'Missing fields' }

  const passwordHash = await hashPassword(password)

  try {
    await withAccountingTransaction(async (conn) => {
      const insertResult: any = await accountingQuery(
        `INSERT INTO users (username, password_hash, is_active) VALUES (?, ?, ?)`,
        [username.trim(), passwordHash, is_active ? 1 : 0],
        conn
      )

      const roleId = await getRoleIdByCode(String(role), conn)
      if (!roleId) {
        throw new Error('ROLE_NOT_FOUND')
      }

      await accountingQuery(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [Number(insertResult.insertId), roleId],
        conn
      )
    })
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Username already exists' }
    if (err.message === 'ROLE_NOT_FOUND') return { ok: false, error: 'Selected role does not exist' }
    throw err
  }

  return { ok: true }
})
