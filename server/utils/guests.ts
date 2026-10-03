import type { PoolConnection } from 'mariadb'
import { getCookie, type H3Event } from 'h3'
import type { PermissionKey } from '~/config/permissions'
import type { User } from '~/types/user'
import { accountingQuery, query } from './db'
import { hmacToken, maxAgeMinutes } from './auth'
import { canAccessAffiliation } from './affiliations'

export type GuestAccessLevel = 'use' | 'manage'

export function isGuestAccessLevel(value: unknown): value is GuestAccessLevel {
  return value === 'use' || value === 'manage'
}

export function getGuestPermissions(level: GuestAccessLevel): PermissionKey[] {
  if (level === 'manage') return ['cash_register.use', 'cash_register.guest_manage']
  return ['cash_register.use']
}

export async function createGuestSession(guestUserId: number, token: string) {
  const tokenHash = hmacToken(token)
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const expiresAt = new Date(Date.now() + maxAgeMinutes * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')

  await query(
    `INSERT INTO guest_sessions (guest_user_id, token_hash, created_at, last_active_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [guestUserId, tokenHash, timestamp, timestamp, expiresAt],
  )

  return true
}

export async function getGuestSessionByToken(token: string) {
  const tokenHash = hmacToken(token)
  const rows = await query<any[]>(
    `SELECT s.*, g.username, g.is_active, g.must_change_password, g.access_level,
            g.affiliation_id, a.name AS affiliation_name
     FROM guest_sessions s
     JOIN guest_users g ON g.id = s.guest_user_id
     LEFT JOIN affiliations a ON a.id = g.affiliation_id
     WHERE s.token_hash = ?`,
    [tokenHash],
  )

  return rows[0] || null
}

export async function touchGuestSession(token: string) {
  const tokenHash = hmacToken(token)
  const lastActiveAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await query(
    `UPDATE guest_sessions SET last_active_at = ? WHERE token_hash = ?`,
    [lastActiveAt, tokenHash],
  )

  return true
}

export async function deleteGuestSessionByToken(token: string) {
  const tokenHash = hmacToken(token)
  await query(`DELETE FROM guest_sessions WHERE token_hash = ?`, [tokenHash])
}

/** `exceptTokenHash` keeps one session alive - the actor's own when they edit themselves. */
export async function deleteGuestSessions(guestUserId: number, conn?: PoolConnection, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    await query(
      `DELETE FROM guest_sessions WHERE guest_user_id = ? AND token_hash <> ?`,
      [guestUserId, exceptTokenHash],
      conn,
    )
    return
  }

  await query(`DELETE FROM guest_sessions WHERE guest_user_id = ?`, [guestUserId], conn)
}

/** Hash of the session token the request came in with (the till's own cookie). */
export function getRequestTokenHash(event: H3Event) {
  const token = getCookie(event, process.env.SESSION_COOKIE_NAME || 'app_session')
  return token ? hmacToken(token) : undefined
}

export async function cleanupExpiredGuestSessions() {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  await query(`DELETE FROM guest_sessions WHERE expires_at IS NOT NULL AND expires_at < ?`, [now])
}

/** Usernames are unique across regular users and guest accounts, so login stays unambiguous. */
export async function isUsernameTaken(
  username: string,
  options: { excludeGuestId?: number, excludeUserId?: number } = {},
) {
  const guestRows = await query<{ id: number }[]>(
    `SELECT id FROM guest_users WHERE username = ? AND id <> ? LIMIT 1`,
    [username, options.excludeGuestId ?? 0],
  )
  if (guestRows.length) return true

  const userRows = await accountingQuery<{ id: number }[]>(
    `SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1`,
    [username, options.excludeUserId ?? 0],
  )
  return userRows.length > 0
}

export interface GuestAccountRow {
  id: number
  username: string
  access_level: GuestAccessLevel
  affiliation_id: number | null
  affiliation_name: string | null
  is_active: boolean
  must_change_password: boolean
  created_by: string | null
  created_at: string
}

function mapGuestAccountRow(row: any): GuestAccountRow {
  return {
    id: Number(row.id),
    username: String(row.username),
    access_level: row.access_level === 'manage' ? 'manage' : 'use',
    affiliation_id: row.affiliation_id == null ? null : Number(row.affiliation_id),
    affiliation_name: row.affiliation_name == null ? null : String(row.affiliation_name),
    is_active: row.is_active === 1 || row.is_active === '1',
    must_change_password: row.must_change_password === 1 || row.must_change_password === '1',
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: row.created_at,
  }
}

const GUEST_ACCOUNT_SELECT = `
  SELECT g.id, g.username, g.access_level, g.affiliation_id, a.name AS affiliation_name,
         g.is_active, g.must_change_password, g.created_by, g.created_at
  FROM guest_users g
  LEFT JOIN affiliations a ON a.id = g.affiliation_id`

/** `affiliationId` undefined lists every guest; a number limits to that affiliation. */
export async function listGuestAccounts(affiliationId?: number) {
  const rows = affiliationId === undefined
    ? await query<any[]>(`${GUEST_ACCOUNT_SELECT} ORDER BY g.username ASC`)
    : await query<any[]>(`${GUEST_ACCOUNT_SELECT} WHERE g.affiliation_id = ? ORDER BY g.username ASC`, [affiliationId])

  return rows.map(mapGuestAccountRow)
}

export async function getGuestAccountById(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null
  const rows = await query<any[]>(`${GUEST_ACCOUNT_SELECT} WHERE g.id = ? LIMIT 1`, [id])
  return rows[0] ? mapGuestAccountRow(rows[0]) : null
}

export function parseGuestUsername(value: unknown) {
  const username = typeof value === 'string' ? value.trim() : ''
  if (!username || username.length > 255) return null
  return username
}

export async function loadManageableGuestAccount(actor: User, id: unknown, options: { allowSelf?: boolean } = {}) {
  const guestId = Number(id)
  if (!Number.isInteger(guestId) || guestId <= 0) return { ok: false as const, error: 'Ungültige ID' }

  const guest = await getGuestAccountById(guestId)
  if (!guest || !canAccessAffiliation(actor, guest.affiliation_id)) {
    return { ok: false as const, error: 'Gastkonto nicht gefunden' }
  }

  const isSelf = actor.kind === 'guest' && actor.id === guest.id
  if (isSelf && !options.allowSelf) {
    return { ok: false as const, error: 'Das ist für das eigene Konto nicht möglich' }
  }

  return { ok: true as const, guest, isSelf }
}
