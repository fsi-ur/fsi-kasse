type ApiErrorResponse = {
  ok?: boolean
  error?: string
}

function isUnauthenticatedResponse(data: unknown) {
  if (!data || typeof data !== 'object') return false

  const response = data as ApiErrorResponse
  return response.ok === false && response.error === 'Not authenticated'
}

function isPasswordChangeRequiredResponse(data: unknown) {
  if (!data || typeof data !== 'object') return false

  const response = data as ApiErrorResponse
  return response.ok === false && response.error === 'Password change required'
}

export default defineNuxtPlugin(() => {
  const apiFetch = $fetch.create({
    onResponse({ response }) {
      if (isUnauthenticatedResponse(response._data)) {
        useAuth().redirectToLogin()
      }
      if (isPasswordChangeRequiredResponse(response._data)) {
        useAuth().fetchSession()
      }
    },
    onResponseError({ response }) {
      if (response?.status === 401 || isUnauthenticatedResponse(response?._data)) {
        useAuth().redirectToLogin()
      }
      if (isPasswordChangeRequiredResponse(response?._data)) {
        useAuth().fetchSession()
      }
    },
  })

  globalThis.$fetch = apiFetch as typeof $fetch
})
