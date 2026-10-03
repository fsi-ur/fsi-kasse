import { cachedFetch } from '~/composables/useCachedFetch'

export interface StandEntry {
  id: number
  name: string
  is_active: boolean
  item_ids: number[]
}

export const useStands = () => {
  const stands = useState<StandEntry[]>('stands', () => [])
  const { selectedStand } = useCheckout()

  const activeStands = computed(() => stands.value.filter(stand => stand.is_active))

  const effectiveStand = computed(() =>
    activeStands.value.find(stand => stand.id === Number(selectedStand.value)) ?? null)

  async function load() {
    let result
    try {
      result = await cachedFetch<any>('/api/stands')
    } catch {
      return
    }

    const res = result.data
    if (!res.ok) return

    stands.value = ('stands' in res ? res.stands as any[] : []).map(stand => ({
      id: Number(stand.id),
      name: String(stand.name),
      is_active: stand.is_active === true || stand.is_active === 1,
      item_ids: Array.isArray(stand.item_ids) ? stand.item_ids.map(Number) : [],
    }))

    if (!result.stale && selectedStand.value && !effectiveStand.value) {
      selectedStand.value = ''
    }
  }

  return { stands, activeStands, effectiveStand, load }
}
