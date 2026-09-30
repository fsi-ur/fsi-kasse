import type { SessionResponse } from '~/server/utils/sessionGuard'
import type { LoginResponse } from '~/server/api/auth/login.post'
import type { User } from '~/types/user'
import type { PermissionKey } from '~/config/permissions'
import { useConnectivity } from '~/composables/useConnectivity'
import { clearOfflineCache, readCachedValue, writeCachedValue } from '~/composables/useCachedFetch'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import { useToast } from '~/composables/useToast'
import { useI18n } from '~/composables/useI18n'
import { isRetryableError, OFFLINE_REQUEST_TIMEOUT_MS } from '~/utils/network'

// Key in the offline cache store; cleared together with the cached responses.
const PERSISTED_USER_KEY = 'auth_user'

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null)

  /**
   * `clearOfflineData` is only false when the session could not be checked at
   * all (network error) — then nothing is known about it and the cached data
   * must survive for the next attempt. Every server-confirmed session loss wipes it.
   */
  function redirectToLogin(clearOfflineData = true) {
    user.value = null

    if (!import.meta.client) return

    if (clearOfflineData) clearOfflineCache()

    const { currentPage, setPage } = usePage()
    if (currentPage.value !== 'Login') setPage('Login')
  }

  async function fetchSession() {
    try {
      const data = await $fetch<SessionResponse>('/api/auth/session', {
        timeout: OFFLINE_REQUEST_TIMEOUT_MS,
        retry: 0,
      })
      if (data.ok) {
        user.value = data.user
        writeCachedValue(PERSISTED_USER_KEY, data.user)
        return user.value
      } else {
        redirectToLogin()
        return null
      }
    } catch (err) {
      // Server unreachable: keep the cashier logged in on the last known user.
      // It only drives the UI — the server re-checks every request once it is back.
      if (isRetryableError(err)) {
        useConnectivity().markOffline()

        if (user.value) return user.value

        const persisted = await readCachedValue<User>(PERSISTED_USER_KEY)
        if (persisted) {
          user.value = persisted
          return user.value
        }
      }

      redirectToLogin(false)
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
    // The outbox survives logout, but logging out with unsynced sales is almost
    // always an accident — make the cashier resolve them first.
    if (useOfflineQueue().pendingCount.value > 0) {
      useToast().error(useI18n().t('offline.logoutBlocked'))
      return
    }

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
