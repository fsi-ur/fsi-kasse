import { useConnectivity } from '~/composables/useConnectivity'

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

const UNREACHABLE_STATUSES = new Set([502, 503, 504])

export default defineNuxtPlugin(() => {
  const { markOnline, markOffline } = useConnectivity()

  const apiFetch = $fetch.create({
    onRequestError() {
      markOffline()
    },
    onResponse({ response }) {
      if (UNREACHABLE_STATUSES.has(response.status)) markOffline()
      else markOnline()

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
