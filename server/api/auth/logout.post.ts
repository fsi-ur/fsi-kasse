import { defineEventHandler, getCookie, setCookie } from 'h3'
import { deleteSessionByToken, cleanupExpiredSessions } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  const token = getCookie(event, cookieName)
  if (token) {
    await deleteSessionByToken(token)
    setCookie(event, cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0
    })
  }

  try {
    await cleanupExpiredSessions()
  } catch (err) {
    console.error('Failed to clean up expired sessions', err)
  }

  return { ok: true }
})
