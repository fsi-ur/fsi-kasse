import { getCookie } from 'h3'
import { getSessionByToken, touchSession, inactivityMinutes, deleteSessionByToken } from './auth'
import { getUserPermissions, getUserRoleIds } from './permissions'
import { deleteGuestSessionByToken, getGuestPermissions, getGuestSessionByToken, touchGuestSession } from './guests'
import { getOverlayRole } from './roles'
import { isConnectedAccountingMode } from './db'
import { normalizeBigInt } from '~/server/utils/normalize'
import type { User } from '~/types/user'

interface SessionSuccess {
  ok: true
  user: User
}

interface SessionError {
  ok: false
  error: string
}

export type SessionResponse = SessionSuccess | SessionError

function getSessionCookieNames() {
  const cookieNames = [process.env.SESSION_COOKIE_NAME || 'app_session']

  // In connected mode sessions live in the shared accounting database, so a
  // session created by the accounting application is also valid here. Accept
  // its cookie as fallback to allow managing the cash register from there.
  const accountingCookieName = process.env.ACCOUNTING_SESSION_COOKIE_NAME
  if (isConnectedAccountingMode() && accountingCookieName && !cookieNames.includes(accountingCookieName)) {
    cookieNames.push(accountingCookieName)
  }

  return cookieNames
}

type SessionCheck = { ok: true, isActive: boolean } | SessionError

async function checkSessionValidity(session: any, deleteSession: () => Promise<void>): Promise<SessionCheck> {
  const isActive = session.is_active === 1 || session.is_active === '1'
  if (!isActive) {
    await deleteSession()
    return { ok: false, error: 'User inactive' }
  }

  const now = new Date()
  if (session.expires_at && new Date(session.expires_at + 'Z') < now) {
    return { ok: false, error: 'Session expired' }
  }

  const lastActive = new Date(session.last_active_at + 'Z')
  const inactivityLimit = new Date(lastActive.getTime() + inactivityMinutes * 60 * 1000)

  if (inactivityLimit < now) {
    await deleteSession()
    return { ok: false, error: 'User has been inactive for too long' }
  }

  return { ok: true, isActive }
}

async function getGuestUserFromToken(token: string, touch: boolean): Promise<SessionResponse> {
  const session = normalizeBigInt(await getGuestSessionByToken(token))
  if (!session) return { ok: false, error: 'Session not found' }

  const check = await checkSessionValidity(session, () => deleteGuestSessionByToken(token))
  if (!check.ok) return check

  if (touch) await touchGuestSession(token)

  const permissions = getGuestPermissions(session.access_level === 'manage' ? 'manage' : 'use')

  return {
    ok: true,
    user: {
      id: Number(session.guest_user_id),
      kind: 'guest',
      username: session.username,
      role: getOverlayRole(permissions),
      roles: [],
      permissions,
      is_active: check.isActive,
      must_change_password: session.must_change_password === 1 || session.must_change_password === '1',
      affiliation_id: session.affiliation_id == null ? null : Number(session.affiliation_id),
      affiliation_name: session.affiliation_name == null ? null : String(session.affiliation_name),
    },
  }
}

export async function getCurrentUserFromEvent(event: any, touch: boolean): Promise<SessionResponse> {
  let token: string | undefined
  let cookieName: string | undefined
  for (const name of getSessionCookieNames()) {
    token = getCookie(event, name)
    if (token) {
      cookieName = name
      break
    }
  }

  if (!token) return { ok: false, error: 'Missing token' }
  const sessionToken = token

  const session = normalizeBigInt(await getSessionByToken(sessionToken))
  if (!session) {
    // Guest sessions are only ever issued by the till under its own cookie.
    if (cookieName === getSessionCookieNames()[0]) return getGuestUserFromToken(sessionToken, touch)
    return { ok: false, error: 'Session not found' }
  }

  const check = await checkSessionValidity(session, () => deleteSessionByToken(sessionToken))
  if (!check.ok) return check

  if (touch) await touchSession(sessionToken)

  const roles = await getUserRoleIds(Number(session.user_id))
  const permissions = await getUserPermissions(Number(session.user_id), roles)

  if (!permissions.includes('cash_register.use')) {
    return { ok: false, error: 'Not authorized' }
  }

  return {
    ok: true,
    user: {
      id: Number(session.user_id),
      kind: 'user',
      username: session.username,
      role: getOverlayRole(permissions),
      roles,
      permissions,
      is_active: check.isActive,
      must_change_password: session.must_change_password === 1 || session.must_change_password === '1',
      affiliation_id: null,
      affiliation_name: null,
    }
  }
}
