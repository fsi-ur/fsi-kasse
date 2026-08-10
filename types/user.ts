import type { PermissionKey } from '~/config/permissions'

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  roles: number[]
  permissions: PermissionKey[]
  is_active: boolean
  must_change_password: boolean
}
