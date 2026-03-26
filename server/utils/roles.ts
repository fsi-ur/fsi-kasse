import type { PoolConnection } from 'mariadb'
import { query } from './db'

interface UserRoleCodeRow {
  code: string
}

export async function getUserRoleCodes(userId: number, conn?: PoolConnection): Promise<string[]> {
  const rows = await query<UserRoleCodeRow[]>(
    `
    SELECT r.code
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ?
      AND r.is_active = 1
    ORDER BY r.is_default DESC, r.code ASC
    `,
    [userId],
    conn,
  )

  return rows
    .map(row => String(row.code || '').trim())
    .filter(Boolean)
}

export function getPrimaryRoleCode(roleCodes: string[]): string {
  if (roleCodes.includes('admin')) return 'admin'
  return roleCodes[0] || 'user'
}
