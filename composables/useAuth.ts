export type UserRole = 'guest' | 'user' | 'admin'

export interface User {
  name: string
  role: UserRole
}

export const useAuth = () => {
  const user = useState<User | null>('user', () => null)

  const login = (name: string, role: UserRole) => {
    user.value = { name, role }
  }

  const logout = () => {
    user.value = null
  }

  const isLoggedIn = () => !!user.value

  const hasRole = (role: UserRole | UserRole[]) => {
    if (!user.value) return false
    if (Array.isArray(role)) return role.includes(user.value.role)
    return user.value.role === role
  }

  return { user, login, logout, isLoggedIn, hasRole }
}