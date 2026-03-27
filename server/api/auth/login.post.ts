import { defineEventHandler, readBody, setCookie } from 'h3'
import { accountingQuery } from '~/server/utils/db'
import { makeToken, createSession, comparePassword } from '~/server/utils/auth'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getUserPermissions, getUserRoleIds } from '~/server/utils/permissions'
import { getOverlayRole } from '~/server/utils/roles'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = body

  if (!username || !password) {
    return { ok: false, error: 'Missing credentials' }
  }

  const rows: any = await accountingQuery('SELECT * FROM users WHERE username = ? LIMIT 1', [username])
  const user = normalizeBigInt(rows && rows[0])

  if (!user) return { ok: false, error: 'Invalid username or password' }
  if (!user.is_active) return { ok: false, error: 'User is inactive' }

  const match = await comparePassword(password, user.password_hash)
  if (!match) return { ok: false, error: 'Invalid username or password' }

  const roles = await getUserRoleIds(Number(user.id))
  const permissions = await getUserPermissions(Number(user.id), roles)
  console.log(permissions)
  if (!permissions.includes('cash_register.use')) {
    return { ok: false, error: 'Not authorized' }
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
      permissions,
    }
  }
})
