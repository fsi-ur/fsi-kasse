import { defineEventHandler, readBody } from 'h3'
import { accountingQuery, isConnectedAccountingMode, withAccountingTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

interface RequirePasswordChangeBody {
  user_id?: number
}

interface RequirePasswordChangeSuccess {
  ok: true
}

interface RequirePasswordChangeError {
  ok: false
  error: string
}

export type RequirePasswordChangeResponse = RequirePasswordChangeSuccess | RequirePasswordChangeError

export default defineEventHandler(async (event): Promise<RequirePasswordChangeResponse> => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  const body = await readBody<RequirePasswordChangeBody | null>(event)
  const userId = Number(body?.user_id)
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, error: 'Missing fields' }

  try {
    await withAccountingTransaction(async (conn) => {
      const result: any = await accountingQuery(
        'UPDATE users SET must_change_password = 1 WHERE id = ?',
        [userId],
        conn,
      )

      if (Number(result.affectedRows ?? 0) === 0) {
        throw new Error('USER_NOT_FOUND')
      }
    })
  } catch (err: any) {
    if (err?.message === 'USER_NOT_FOUND') return { ok: false, error: 'User not found' }
    return { ok: false, error: err?.code || 'Failed to flag user' }
  }

  return { ok: true }
})
