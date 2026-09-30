import { defineEventHandler, readBody, setCookie } from 'h3'
import { accountingQuery, isConnectedAccountingMode } from '~/server/utils/db'
import { makeToken, createSession, comparePassword } from '~/server/utils/auth'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getUserPermissions, getUserRoleIds } from '~/server/utils/permissions'
import { getOverlayRole } from '~/server/utils/roles'
import type { User } from '~/types/user'

interface LoginSuccess {
  ok: true
  user: User
}

export type LoginErrorCode =
  | 'missing_credentials'
  | 'invalid_credentials'
  | 'inactive_user'
  | 'not_authorized'
  | 'password_change_required'
  | 'server_error'
  | 'network_error'
  | 'session_not_established'

interface LoginError {
  ok: false
  error: string
  code: LoginErrorCode
}

export type LoginResponse = LoginSuccess | LoginError

export default defineEventHandler(async (event): Promise<LoginResponse> => {
  try {
    const body = await readBody(event)
    const username = body?.username
    const password = body?.password

    if (!username || !password) {
      return { ok: false, error: 'Missing credentials', code: 'missing_credentials' }
    }

    const rows: any = await accountingQuery(
      'SELECT id, username, password_hash, is_active, must_change_password FROM users WHERE username = ? LIMIT 1',
      [username]
    )
    const user = normalizeBigInt(rows && rows[0])

    if (!user) return { ok: false, error: 'Invalid username or password', code: 'invalid_credentials' }

    const isActive = user.is_active === 1 || user.is_active === '1'
    if (!isActive) return { ok: false, error: 'User is inactive', code: 'inactive_user' }

    const match = await comparePassword(password, user.password_hash)
    if (!match) return { ok: false, error: 'Invalid username or password', code: 'invalid_credentials' }

    const roles = await getUserRoleIds(Number(user.id))
    const permissions = await getUserPermissions(Number(user.id), roles)

    if (!permissions.includes('cash_register.use')) {
      return { ok: false, error: 'Not authorized', code: 'not_authorized' }
    }

    // The till cannot resolve a required password change in connected mode - that
    // credential belongs to the accounting app - so refuse before opening a
    // session instead of letting the user into a dead end.
    const mustChangePassword = user.must_change_password === 1 || user.must_change_password === '1'
    if (mustChangePassword && isConnectedAccountingMode()) {
      return { ok: false, error: 'Password change required', code: 'password_change_required' }
    }

    const token = makeToken()
    await createSession(Number(user.id), token)

    const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
    const maxAgeSeconds = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '1440') * 60

    setCookie(event, cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeSeconds,
    })

    return {
      ok: true,
      user: {
        id: Number(user.id),
        username: user.username,
        role: getOverlayRole(permissions),
        roles,
        permissions,
        is_active: isActive,
        must_change_password: mustChangePassword,
      }
    }
  } catch (err) {
    console.error('Login failed with an unexpected error', err)
    return { ok: false, error: 'Unexpected error', code: 'server_error' }
  }
})
