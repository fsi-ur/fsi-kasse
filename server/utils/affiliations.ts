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
