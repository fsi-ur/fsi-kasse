import type { SessionResponse } from '~/server/utils/sessionGuard'
import type { LoginResponse } from '~/server/api/auth/login.post'
import type { User } from '~/types/user'
import type { PermissionKey } from '~/config/permissions'

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null)

  function redirectToLogin() {
    user.value = null

    if (!import.meta.client) return

    const { currentPage, setPage } = usePage()
    if (currentPage.value !== 'Login') setPage('Login')
  }

  async function fetchSession() {
    try {
      const data = await $fetch<SessionResponse>('/api/auth/session')
      if (data.ok) {
        user.value = data.user
        return user.value
      } else {
        redirectToLogin()
        return null
      }
    } catch {
      redirectToLogin()
      return null
    }
  }

  async function login(username: string, password: string): Promise<LoginResponse> {
    try {
      const res = await $fetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { username, password }
      })

      if (res.ok) {
        await fetchSession()
        // The server accepted the credentials, but the browser did not keep the session cookie.
        if (!user.value) {
          return { ok: false, error: 'Session cookie was not established', code: 'session_not_established' }
        }
      }

      return res
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error', code: 'network_error' }
    }
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    redirectToLogin()
  }

  function hasPermission(permissions: PermissionKey[] | PermissionKey) {
    if (!user.value) return false
    if (Array.isArray(permissions)) return permissions.some(p => user.value!.permissions.includes(p))
    return user.value.permissions.includes(permissions)
  }

  function hasAllPermissions(permissions: PermissionKey[]) {
    if (!user.value) return false
    return permissions.every(p => user.value!.permissions.includes(p))
  }

  return { user, fetchSession, login, logout, redirectToLogin, hasPermission, hasAllPermissions }
}
