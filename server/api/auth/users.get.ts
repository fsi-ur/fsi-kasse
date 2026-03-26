import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getPrimaryRoleCode } from '~/server/utils/roles'

export default defineEventHandler(async (event) => {
  const current = await getCurrentUserFromEvent(event, { touch: true })
  if (!current) return { ok: false, error: 'Not authenticated' }
  if (current.role !== 'admin') return { ok: false, error: 'Not authorized' }

  const rows: any[] = await query(`
    SELECT
      u.id,
      u.username,
      u.is_active,
      u.created_at,
      GROUP_CONCAT(DISTINCT r.code ORDER BY r.is_default DESC, r.code ASC) AS role_codes
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = 1
    GROUP BY u.id, u.username, u.is_active, u.created_at
    ORDER BY u.id ASC
  `)

  const users = normalizeBigInt(rows).map((row: any) => {
    const roles = String(row.role_codes || '')
      .split(',')
      .map((code: string) => code.trim())
      .filter(Boolean)

    return {
      id: row.id,
      username: row.username,
      role: getPrimaryRoleCode(roles),
      roles,
      is_active: row.is_active,
      created_at: row.created_at,
    }
  })

  return { ok: true, users }
})
