import { defineEventHandler, readBody } from 'h3'
import { hashPassword } from '~/server/utils/auth'
import { accountingQuery, isConnectedAccountingMode, withAccountingTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'

interface AdminSetPasswordBody {
  user_id?: number
  newPassword?: string
  confirmPassword?: string
}

interface AdminSetPasswordSuccess {
  ok: true
}

interface AdminSetPasswordError {
  ok: false
  error: string
}

export type AdminSetPasswordResponse = AdminSetPasswordSuccess | AdminSetPasswordError

export default defineEventHandler(async (event): Promise<AdminSetPasswordResponse> => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  const body = await readBody<AdminSetPasswordBody | null>(event)
  const userId = Number(body?.user_id)
  const newPassword = String(body?.newPassword || '')
  const confirmPassword = String(body?.confirmPassword || '')

  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, error: 'Missing fields' }
  if (!newPassword || !confirmPassword) return { ok: false, error: 'Missing fields' }
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'Password too short' }
  if (newPassword !== confirmPassword) return { ok: false, error: 'Passwords do not match' }

  const newPasswordHash = await hashPassword(newPassword)

  try {
    await withAccountingTransaction(async (conn) => {
      const result: any = await accountingQuery(
        'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
        [newPasswordHash, userId],
        conn,
      )

      if (Number(result.affectedRows ?? 0) === 0) {
        throw new Error('USER_NOT_FOUND')
      }

      await accountingQuery('DELETE FROM sessions WHERE user_id = ?', [userId], conn)
    })
  } catch (err: any) {
    if (err?.message === 'USER_NOT_FOUND') return { ok: false, error: 'User not found' }
    return { ok: false, error: err?.code || 'Failed to set password' }
  }

  return { ok: true }
})
