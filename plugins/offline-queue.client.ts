import { useConnectivity } from '~/composables/useConnectivity'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import { useAuth } from '~/composables/useAuth'
import { useCheckout } from '~/composables/useCheckout'
import { useToast } from '~/composables/useToast'
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'

const TICK_INTERVAL_MS = 15_000

// Wires the offline queue into the app: when to probe, when to flush, how to
// report a flush, and when a service worker update may reload the page.
export default defineNuxtPlugin((nuxtApp) => {
  const connectivity = useConnectivity()
  const queue = useOfflineQueue()
  const { user } = useAuth()
  const { orderItems } = useCheckout()
  const toast = useToast()
  const { t } = useI18n()
  const { formatCurrency } = useLocaleFormatters()

  queue.ready()

  // Covers both the boot (session restored) and a successful login.
  watch(user, (current, previous) => {
    if (current && !previous) queue.flush()
  })

  connectivity.onOnline(() => {
    if (user.value) queue.flush()
  })

  window.addEventListener('online', () => connectivity.probe())
  window.addEventListener('offline', () => connectivity.markOffline())

  setInterval(() => {
    if (!connectivity.isOnline.value) {
      connectivity.probe()
      return
    }
    if (user.value && queue.pendingCount.value > 0) queue.flush()
  }, TICK_INTERVAL_MS)

  window.addEventListener('beforeunload', (event) => {
    if (queue.pendingCount.value === 0) return
    event.preventDefault()
    event.returnValue = ''
  })

  queue.onFlushed(({ synced, failed }) => {
    if (synced.length) {
      const changedTotals = synced.filter(({ entry, result }) => {
        const bookedTotal = entry.kind === 'checkout'
          ? Number(result?.total)
          : Number(result?.amount)
        return Number.isFinite(bookedTotal) && Math.abs(bookedTotal - entry.display.localTotal) >= 0.005
      })

      let message = t('offline.syncedCount', { count: synced.length })
      if (changedTotals.length) {
        const booked = changedTotals.reduce((sum, { entry, result }) =>
          sum + Number(entry.kind === 'checkout' ? result.total : result.amount), 0)
        message += ` ${t('offline.syncedTotalChanged', { count: changedTotals.length, total: formatCurrency(booked) })}`
      }

      toast.success(message)
    }

    if (failed.length) {
      toast.error(t('offline.syncFailedCount', { count: failed.length }))
    }
  })

  // A new service worker must not reload the page while sales are unsynced or
  // a cart is being filled — wait until both are empty, then apply it.
  nuxtApp.hook('app:mounted', () => {
    const pwa = nuxtApp.$pwa as { needRefresh: boolean, updateServiceWorker: (reload?: boolean) => Promise<void> } | undefined
    if (!pwa) return

    watch(
      () => pwa.needRefresh
        && queue.pendingCount.value === 0
        && !queue.isFlushing.value
        && orderItems.value.length === 0,
      (canUpdate) => {
        if (canUpdate) pwa.updateServiceWorker(true)
      },
      { immediate: true },
    )
  })
})
