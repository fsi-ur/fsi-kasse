import type { H3Event } from 'h3'
import type { PermissionKey } from '~/config/permissions'
import type { User } from '~/types/user'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

type PermissionCheck = PermissionKey | PermissionKey[]

interface GuardOptions {
  touch?: boolean
  requireAll?: boolean
}

export function hasPermission(user: User | null, permissions: PermissionCheck) {
  if (!user) return false
  if (Array.isArray(permissions)) return permissions.some(permission => user.permissions.includes(permission))
  return user.permissions.includes(permissions)
}

export function hasAllPermissions(user: User | null, permissions: PermissionKey[]) {
  if (!user) return false
  return permissions.every(permission => user.permissions.includes(permission))
}

export async function requirePermission(
  event: H3Event,
  permissions: PermissionCheck,
  options: GuardOptions = {},
) {
  const current = await getCurrentUserFromEvent(event, options.touch ?? true)
  if (!current.ok) return { ok: false as const, error: 'Not authenticated' }

  const allowed = options.requireAll
    ? hasAllPermissions(current.user, Array.isArray(permissions) ? permissions : [permissions])
    : hasPermission(current.user, permissions)

  if (!allowed) return { ok: false as const, error: 'Not authorized' }

  return current
}
