import { useAuth } from '~/composables/useAuth'

type RefreshHandler = () => void | Promise<void>

const refreshHandlers = new Set<RefreshHandler>()

export const useAppRefresh = () => {
  const refreshKey = useState('app-refresh-key', () => 0)
  const isRefreshing = useState('app-is-refreshing', () => false)
  const { fetchSession } = useAuth()

  async function refreshCurrentPage() {
    if (isRefreshing.value) return

    isRefreshing.value = true
    try {
      await fetchSession()
      await Promise.allSettled(Array.from(refreshHandlers, handler => handler()))
    } finally {
      refreshKey.value += 1
      isRefreshing.value = false
    }
  }

  function onRefresh(callback: RefreshHandler) {
    if (!import.meta.client) return () => {}

    refreshHandlers.add(callback)

    const stop = () => {
      refreshHandlers.delete(callback)
    }

    onBeforeUnmount(stop)
    return stop
  }

  return { refreshKey, isRefreshing, refreshCurrentPage, onRefresh }
}
