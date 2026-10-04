import { cachedFetch } from '~/composables/useCachedFetch'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'

export const useFachschaftAvailability = () => {
  const { selectedEvent } = useCheckout()
  const { settings, loadSettings } = useCashRegisterSettings()
  const eventFlags = useState<Record<number, boolean>>('fachschaft_event_flags', () => ({}))

  const fachschaftEnabled = computed(() => {
    if (!settings.value.fachschaft_enabled) return false
    return eventFlags.value[Number(selectedEvent.value)] !== false
  })

  async function loadAvailability(force = false) {
    await Promise.allSettled([
      loadSettings(force),
      (async () => {
        const { data: res } = await cachedFetch<any>('/api/events')
        if (!res.ok || !Array.isArray(res.events)) return
        eventFlags.value = Object.fromEntries(
          res.events.map((entry: any) => [Number(entry.id), Boolean(entry.fachschaft_enabled)]),
        )
      })(),
    ])
  }

  return { fachschaftEnabled, loadAvailability }
}
