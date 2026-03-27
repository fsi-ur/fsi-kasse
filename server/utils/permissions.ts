import { PERMISSIONS, type PermissionKey, implied } from '~/config/permissions'
import { accountingQuery } from '~/server/utils/db'

interface RoleRow {
  role_id: number
}

interface PermissionRow {
  permission_key: PermissionKey
}

export function isValidPermissionKey(key: string): key is PermissionKey {
  return PERMISSIONS.some(permission => permission.key === key)
}

export async function getUserRoleIds(userId: number): Promise<number[]> {
  const rows = await accountingQuery<RoleRow[]>(
    `SELECT ur.role_id
     FROM user_roles ur
     WHERE ur.user_id = ?`,
    [userId]
  )

  return rows
    .map(row => Number(row.role_id))
    .filter(id => Number.isFinite(id))
}

export async function getUserPermissions(userId: number, roles: number[]): Promise<PermissionKey[]> {
  const permissions = new Set<string>()

  if (roles.length) {
    const roleRows = await accountingQuery<{ id: number }[]>(
      `SELECT id
       FROM roles
       WHERE id IN (${roles.map(() => '?').join(',')})
         AND is_active = 1`,
      roles
    )
    const roleIds = roleRows.map(row => Number(row.id)).filter(id => Number.isFinite(id))

    if (roleIds.length) {
      const rolePermissions = await accountingQuery<PermissionRow[]>(
        `SELECT permission_key
         FROM role_permissions
         WHERE role_id IN (${roleIds.map(() => '?').join(',')})`,
        roleIds
      )
      rolePermissions.forEach(permission => permissions.add(permission.permission_key))
    }
  }

  const userPermissions = await accountingQuery<PermissionRow[]>(
    `SELECT permission_key
     FROM user_permissions
     WHERE user_id = ?`,
    [userId]
  )
  userPermissions.forEach(permission => permissions.add(permission.permission_key))

  const validated = new Set<PermissionKey>(
    Array.from(permissions).filter(isValidPermissionKey) as PermissionKey[]
  )

  for (const key of Array.from(validated)) {
    const impliedPermissions = implied[key]
    if (!impliedPermissions) continue
    impliedPermissions.forEach(impliedKey => validated.add(impliedKey))
  }

  return Array.from(validated)
}
