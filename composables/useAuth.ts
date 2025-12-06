interface User {
  id: number
  username: string
  role: string
}

interface SessionResponse {
  ok: boolean
  user?: User
}

interface LoginResponse {
  ok: boolean
  error?: string
}

export const useAuth = () => {
  const user = useState<User | null>('auth_user', () => null)

  async function fetchSession() {
    try {
      const data = await $fetch<SessionResponse>('/api/auth/session')
      if (data?.ok) {
        user.value = data.user!
        return user.value
      } else {
        user.value = null
        return null
      }
    } catch (err: any) {
      user.value = null
      return null
    }
  }

  async function login(username: string, password: string) {
    const res = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })

    if (res.ok) {
      await fetchSession()
      return { ok: true }
    }

    return res
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  function hasRole(roles: string[] | string) {
    if (!user.value) return false
    if (Array.isArray(roles)) return roles.includes(user.value.role)
    return user.value.role === roles
  }
  
  return { user, fetchSession, login, logout, hasRole }
}