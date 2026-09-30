import { OFFLINE_REQUEST_TIMEOUT_MS } from '~/utils/network'

type OnlineHandler = () => void

// Module-level singleton: there is exactly one connection per tab, and the
// fetch layer flips it from inside $fetch hooks where no component is active.
const isOnline = ref(import.meta.client ? navigator.onLine : true)
const onlineHandlers = new Set<OnlineHandler>()
let probePromise: Promise<boolean> | null = null

function markOffline() {
  isOnline.value = false
}

function markOnline() {
  if (isOnline.value) return
  isOnline.value = true
  for (const handler of onlineHandlers) handler()
}

function probe(): Promise<boolean> {
  probePromise ??= (async () => {
    try {
      const res = await $fetch<{ ok: boolean }>('/api/health', {
        timeout: OFFLINE_REQUEST_TIMEOUT_MS,
        retry: 0,
      })
      if (res?.ok) {
        markOnline()
        return true
      }
      return false
    } catch {
      markOffline()
      return false
    } finally {
      probePromise = null
    }
  })()

  return probePromise
}

/** Runs the callback every time the connection comes back. */
function onOnline(handler: OnlineHandler) {
  onlineHandlers.add(handler)
  return () => onlineHandlers.delete(handler)
}

export const useConnectivity = () => ({
  isOnline: readonly(isOnline),
  markOffline,
  markOnline,
  probe,
  onOnline,
})
