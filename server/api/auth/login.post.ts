import { defineEventHandler, readBody, setCookie } from 'h3'
import { query } from '~/server/utils/db'
import { makeToken, createSession, comparePassword } from '~/server/utils/auth'
import { normalizeRow } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = body

  if (!username || !password) {
    return { ok: false, error: 'Missing credentials' }
  }

  const rows: any = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username])

  const user = normalizeRow(rows && rows[0])

  if (!user) {
    return { ok: false, error: 'Invalid username or password' }
  }
  if (!user.is_active) return { ok: false, error: 'User is inactive' }

  const match = await comparePassword(password, user.password_hash)
  if (!match) return { ok: false, error: 'Invalid username or password' }

  const token = makeToken()
  await createSession(user.id, token)

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
    user: { id: user.id, username: user.username, role: user.role }
  }
})