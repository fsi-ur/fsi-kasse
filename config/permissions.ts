export type PermissionKey = 'cash_register.use' | 'cash_register.manage' | 'cash_register.guest_manage'

export interface PermissionDefinition {
  key: PermissionKey
  label: string
  description?: string
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'cash_register.use', label: 'Use cash register' },
  { key: 'cash_register.manage', label: 'Manage cash register' },
  { key: 'cash_register.guest_manage', label: 'Manage guest accounts and guest cashiers' },
]

export const implied: Partial<Record<PermissionKey, PermissionKey[]>> = {
  'cash_register.manage': ['cash_register.use', 'cash_register.guest_manage'],
  'cash_register.guest_manage': ['cash_register.use'],
}
