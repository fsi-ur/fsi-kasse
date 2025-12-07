import { getCookie } from 'h3'
import { getSessionByToken, touchSession, inactivityMinutes, deleteSessionByToken } from './auth'
import { normalizeBigInt } from '~/server/utils/normalize'

export async function getCurrentUserFromEvent(event: any, { touch }: { touch: boolean }) {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  const touch_session = touch === true
  const token = getCookie(event, cookieName)

  if (!token) return { ok: false }

  const session = normalizeBigInt(await getSessionByToken(token))
  if (!session) return { ok: false }

  const now = new Date()
  if (session.expires_at && new Date(session.expires_at + 'Z') < now) {
    return { ok: false }
  }

  const lastActive = new Date(session.last_active_at + 'Z')
  const inactivityLimit = new Date(lastActive.getTime() + inactivityMinutes * 60 * 1000)

  if (inactivityLimit < now) {
    await deleteSessionByToken(token)
    return { ok: false }
  }
  
  if (touch) await touchSession(token)

  return {
    ok: true,
    id: session.user_id,
    username: session.username,
    role: session.role,
    is_active: session.is_active === 1 || session.is_active === '1'
  }
}