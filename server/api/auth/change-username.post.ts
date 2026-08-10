import { defineEventHandler, readBody } from 'h3'
import { accountingQuery, isConnectedAccountingMode, withAccountingTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

interface ChangeUsernameBody {
  user_id?: number
  username?: string
}

interface ChangeUsernameSuccess {
  ok: true
}

interface ChangeUsernameError {
  ok: false
  error: string
}

export type ChangeUsernameResponse = ChangeUsernameSuccess | ChangeUsernameError

export default defineEventHandler(async (event): Promise<ChangeUsernameResponse> => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  const body = await readBody<ChangeUsernameBody | null>(event)
  const userId = Number(body?.user_id)
  const username = String(body?.username || '').trim()

  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, error: 'Missing fields' }
  if (!username) return { ok: false, error: 'Username required' }

  try {
    await withAccountingTransaction(async (conn) => {
      const result: any = await accountingQuery(
        'UPDATE users SET username = ? WHERE id = ?',
        [username, userId],
        conn,
      )

      if (Number(result.affectedRows ?? 0) === 0) {
        throw new Error('USER_NOT_FOUND')
      }
    })
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Username already exists' }
    if (err?.message === 'USER_NOT_FOUND') return { ok: false, error: 'User not found' }
    return { ok: false, error: err?.code || 'Failed to change username' }
  }

  return { ok: true }
})
