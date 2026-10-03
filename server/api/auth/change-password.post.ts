import { defineEventHandler, getCookie, readBody } from 'h3'
import { comparePassword, hashPassword, hmacToken } from '~/server/utils/auth'
import { accountingQuery, isConnectedAccountingMode, query, withAccountingTransaction, withTransaction } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'

interface ChangePasswordBody {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

interface ChangePasswordSuccess {
  ok: true
}

interface ChangePasswordError {
  ok: false
  error: string
}

export type ChangePasswordResponse = ChangePasswordSuccess | ChangePasswordError

export default defineEventHandler(async (event): Promise<ChangePasswordResponse> => {
  // Deliberately not `requirePermission`: this is the one endpoint a user with
  // must_change_password set has to be able to reach.
  const current = await getCurrentUserFromEvent(event, true)
  if (!current.ok) return { ok: false, error: 'Not authenticated' }

  // Guest accounts are till-owned, so they can change their password in connected mode too.
  const isGuest = current.user.kind === 'guest'
  if (!isGuest && isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  const token = getCookie(event, cookieName)
  if (!token) return { ok: false, error: 'Not authenticated' }

  const body = await readBody<ChangePasswordBody | null>(event)
  const currentPassword = String(body?.currentPassword || '')
  const newPassword = String(body?.newPassword || '')
  const confirmPassword = String(body?.confirmPassword || '')

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, error: 'Missing fields' }
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'Password too short' }
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match' }
  }

  const rows = isGuest
    ? await query<{ password_hash: string }[]>(
        'SELECT password_hash FROM guest_users WHERE id = ? AND is_active = 1 LIMIT 1',
        [current.user.id],
      )
    : await accountingQuery<{ password_hash: string }[]>(
        'SELECT password_hash FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [current.user.id],
      )
  const user = rows[0]
  if (!user) return { ok: false, error: 'Not authenticated' }

  const passwordMatches = await comparePassword(currentPassword, user.password_hash)
  if (!passwordMatches) return { ok: false, error: 'Invalid current password' }

  const newPasswordHash = await hashPassword(newPassword)
  const currentTokenHash = hmacToken(token)

  try {
    if (isGuest) {
      await withTransaction(async (conn) => {
        await query(
          'UPDATE guest_users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
          [newPasswordHash, current.user.id],
          conn,
        )
        await query(
          'DELETE FROM guest_sessions WHERE guest_user_id = ? AND token_hash <> ?',
          [current.user.id, currentTokenHash],
          conn,
        )
      })
      return { ok: true }
    }

    await withAccountingTransaction(async (conn) => {
      await accountingQuery(
        'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
        [newPasswordHash, current.user.id],
        conn,
      )
      // Every other device keeps a session opened with the old password.
      await accountingQuery(
        'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?',
        [current.user.id, currentTokenHash],
        conn,
      )
    })
  } catch (err: any) {
    return { ok: false, error: err?.code || 'Password change failed' }
  }

  return { ok: true }
})
