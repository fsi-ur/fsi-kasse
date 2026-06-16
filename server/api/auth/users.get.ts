import { defineEventHandler } from 'h3'
import { accountingQuery } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { requirePermission } from '~/server/utils/api/guards'
import { getUserPermissions, getUserRoleIds } from '~/server/utils/permissions'
import { getOverlayRole } from '~/server/utils/roles'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const rows: any[] = await accountingQuery(`
    SELECT id, username, is_active, NULL AS created_at
    FROM users
    ORDER BY id ASC
  `)

  const users = []
  for (const row of normalizeBigInt(rows)) {
    const roles = await getUserRoleIds(Number(row.id))
    const permissions = await getUserPermissions(Number(row.id), roles)

    users.push({
      id: Number(row.id),
      username: row.username,
      role: getOverlayRole(permissions),
      roles,
      permissions,
      is_active: row.is_active === 1 || row.is_active === '1',
      created_at: row.created_at,
    })
  }

  return { ok: true, users }
})
