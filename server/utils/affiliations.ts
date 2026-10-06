import type { H3Event } from 'h3'
import type { User } from '~/types/user'
import { query } from './db'
import { requirePermission } from './api/guards'

export interface AffiliationRow {
  id: number
  name: string
  is_active: boolean
}

export async function getAffiliationById(id: number, options: { activeOnly?: boolean } = {}) {
  if (!Number.isInteger(id) || id <= 0) return null

  const rows = await query<any[]>(
    `SELECT id, name, is_active FROM affiliations WHERE id = ? ${options.activeOnly === false ? '' : 'AND is_active = 1'} LIMIT 1`,
    [id],
  )
  if (!rows[0]) return null

  return {
    id: Number(rows[0].id),
    name: String(rows[0].name),
    is_active: rows[0].is_active === 1 || rows[0].is_active === '1',
  } satisfies AffiliationRow
}

/** Scoped = a guest with an affiliation; they only ever see and touch their own affiliation. */
export function getActorScope(actor: User): number | null {
  if (actor.kind === 'user') return null
  return actor.affiliation_id ?? null
}

/** Regular users and unaffiliated guest managers may touch every guest; otherwise only their own affiliation. */
export function canAccessAffiliation(actor: User, targetAffiliationId: number | null) {
  const scope = getActorScope(actor)
  if (scope == null) return true
  return targetAffiliationId === scope
}

export interface EventAffiliation {
  affiliation_id: number
  affiliation_name: string
  /** The stands this affiliation runs at the event; may be shared with other affiliations. */
  stands: Array<{ id: number, name: string }>
}

/** Event allowlists keyed by local event id. An event without entries is closed to scoped guests. */
export async function listEventAffiliations(): Promise<Map<number, EventAffiliation[]>> {
  const rows = await query<any[]>(
    `SELECT ea.event_id, ea.affiliation_id, a.name AS affiliation_name
     FROM event_affiliations ea
     JOIN affiliations a ON a.id = ea.affiliation_id
     ORDER BY a.name ASC`,
  )
  const standRows = await query<any[]>(
    `SELECT eas.event_id, eas.affiliation_id, s.id, s.name
     FROM event_affiliation_stands eas
     JOIN stands s ON s.id = eas.stand_id
     ORDER BY s.name ASC`,
  )

  const standsByEntry = new Map<string, Array<{ id: number, name: string }>>()
  for (const row of standRows) {
    const key = `${row.event_id}:${row.affiliation_id}`
    if (!standsByEntry.has(key)) standsByEntry.set(key, [])
    standsByEntry.get(key)!.push({ id: Number(row.id), name: String(row.name) })
  }

  const byEvent = new Map<number, EventAffiliation[]>()
  for (const row of rows) {
    const eventId = Number(row.event_id)
    if (!byEvent.has(eventId)) byEvent.set(eventId, [])
    byEvent.get(eventId)!.push({
      affiliation_id: Number(row.affiliation_id),
      affiliation_name: String(row.affiliation_name),
      stands: standsByEntry.get(`${row.event_id}:${row.affiliation_id}`) ?? [],
    })
  }
  return byEvent
}

async function isAffiliationAllowedAtEvent(affiliationId: number, eventId: number) {
  const rows = await query<any[]>(
    `SELECT 1 AS allowed FROM event_affiliations WHERE event_id = ? AND affiliation_id = ? LIMIT 1`,
    [eventId, affiliationId],
  )
  return rows.length > 0
}

/** Regular users and unaffiliated guests may use every event; scoped guests only those that allow their affiliation. */
export async function canAccessEvent(actor: User, eventId: number) {
  const scope = getActorScope(actor)
  if (scope == null) return true
  return isAffiliationAllowedAtEvent(scope, eventId)
}

/** Member cashiers and unaffiliated guest cashiers work every event; affiliated guest cashiers only allowed ones. */
export async function canCashierWorkEvent(cashier: { is_guest: boolean, affiliation_id: number | null }, eventId: number) {
  if (!cashier.is_guest || cashier.affiliation_id == null) return true
  return isAffiliationAllowedAtEvent(cashier.affiliation_id, eventId)
}

export async function resolveAssignableAffiliation(
  actor: User,
  requested: unknown,
  fallback: number | null = null,
): Promise<{ ok: true, affiliationId: number | null } | { ok: false, error: string }> {
  const scope = getActorScope(actor)

  if (scope != null) {
    if (requested === undefined || Number(requested) === scope) return { ok: true, affiliationId: scope }
    return { ok: false, error: 'Zugehörigkeit nicht erlaubt' }
  }

  if (requested === undefined) return { ok: true, affiliationId: fallback }
  if (requested === null || requested === '') return { ok: true, affiliationId: null }

  const affiliationId = Number(requested)
  if (affiliationId === fallback) return { ok: true, affiliationId }

  const affiliation = await getAffiliationById(affiliationId)
  if (!affiliation) return { ok: false, error: 'Zugehörigkeit nicht gefunden' }

  return { ok: true, affiliationId: affiliation.id }
}

export async function requireAffiliationAdmin(event: H3Event) {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current
  if (current.user.kind !== 'user') return { ok: false as const, error: 'Nicht berechtigt' }
  return current
}

export function parseAffiliationName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 255) return null
  return name
}
