import { defineEventHandler, setCookie } from 'h3'
import { accountingQuery, isConnectedAccountingMode } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

interface LogoutAllSuccess {
  ok: true
}

interface LogoutAllError {
  ok: false
  error: string
}

export type LogoutAllResponse = LogoutAllSuccess | LogoutAllError

export default defineEventHandler(async (event): Promise<LogoutAllResponse> => {
  const current = await getCurrentUserFromEvent(event, false)
  if (!current.ok) return { ok: false, error: 'Not authenticated' }

  // In connected mode the sessions table is shared with the accounting app, so
  // this would also end the user's session there.
  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'User management is disabled in connected mode' }
  }

  try {
    await accountingQuery('DELETE FROM sessions WHERE user_id = ?', [current.user.id])
  } catch (err: any) {
    return { ok: false, error: err?.code || 'Logout all failed' }
  }

  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  setCookie(event, cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })

  return { ok: true }
})
