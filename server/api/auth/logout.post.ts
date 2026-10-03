import { defineEventHandler, getCookie, setCookie } from 'h3'
import { deleteSessionByToken, cleanupExpiredSessions } from '~/server/utils/auth'
import { cleanupExpiredGuestSessions, deleteGuestSessionByToken } from '~/server/utils/guests'

export default defineEventHandler(async (event) => {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  const token = getCookie(event, cookieName)
  if (token) {
    await deleteSessionByToken(token)
    await deleteGuestSessionByToken(token)
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
    await cleanupExpiredGuestSessions()
  } catch (err) {
    console.error('Failed to clean up expired sessions', err)
  }

  return { ok: true }
})
