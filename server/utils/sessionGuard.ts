import { getCookie } from 'h3'
import { getSessionByToken, touchSession, inactivityMinutes, deleteSessionByToken } from './auth'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getPrimaryRoleCode, getUserRoleCodes } from './roles'

export async function getCurrentUserFromEvent(event: any, { touch }: { touch: boolean }) {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'app_session'
  const token = getCookie(event, cookieName)

  if (!token) return null

  const session = normalizeBigInt(await getSessionByToken(token))
  if (!session) return null

  const now = new Date()
  if (session.expires_at && new Date(session.expires_at + 'Z') < now) {
    return null
  }

  const lastActive = new Date(session.last_active_at + 'Z')
  const inactivityLimit = new Date(lastActive.getTime() + inactivityMinutes * 60 * 1000)

  if (inactivityLimit < now) {
    await deleteSessionByToken(token)
    return null
  }
  
  if (touch) await touchSession(token)

  const roles = await getUserRoleCodes(Number(session.user_id))
  const role = getPrimaryRoleCode(roles)

  return {
    id: session.user_id,
    username: session.username,
    role,
    roles,
    is_active: session.is_active === 1 || session.is_active === '1'
  }
}
