import type { PoolConnection } from 'mariadb'
import { accountingQuery } from './db'
import type { PermissionKey } from '~/config/permissions'

interface RoleIdRow {
  id: number
}

export async function getDefaultRoleId(conn?: PoolConnection) {
  const rows = await accountingQuery<RoleIdRow[]>(
    `SELECT id
     FROM roles
     WHERE is_default = 1
       AND is_active = 1
     ORDER BY id ASC
     LIMIT 1`,
    [],
    conn
  )

  return rows[0] ? Number(rows[0].id) : null
}

export async function getRoleIdByCode(code: string, conn?: PoolConnection) {
  const rows = await accountingQuery<RoleIdRow[]>(
    `SELECT id
     FROM roles
     WHERE code = ?
       AND is_active = 1
     LIMIT 1`,
    [code],
    conn
  )

  return rows[0] ? Number(rows[0].id) : null
}

export async function assignDefaultRoleToUser(userId: number, conn?: PoolConnection) {
  const defaultRoleId = await getDefaultRoleId(conn)
  if (!defaultRoleId) return null

  await accountingQuery(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     VALUES (?, ?)`,
    [userId, defaultRoleId],
    conn
  )

  return defaultRoleId
}

export function getOverlayRole(permissions: PermissionKey[]): 'admin' | 'user' {
  if (permissions.includes('cash_register.manage')) return 'admin'
  return 'user'
}
