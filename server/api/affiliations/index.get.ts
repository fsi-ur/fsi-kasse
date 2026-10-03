import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { getActorScope } from '~/server/utils/affiliations'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const scope = getActorScope(current.user)
  const rows = scope == null
    ? await query<any[]>(`SELECT id, name, is_active, created_at FROM affiliations ORDER BY name ASC`)
    : await query<any[]>(`SELECT id, name, is_active, created_at FROM affiliations WHERE id = ?`, [scope])

  const affiliations = rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    is_active: row.is_active === 1 || row.is_active === '1',
    created_at: row.created_at,
  }))

  return { ok: true, affiliations }
})
