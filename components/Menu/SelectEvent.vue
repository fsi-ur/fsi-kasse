<template>
  <div class="w-40 md:w-52">
    <CommonSearchSelect
      v-model="query"
      :options="options"
      :placeholder="t('select.event')"
      :empty-text="t('select.noEvents')"
      :selected-label="selectedLabel"
      @select="onSelect"
      @clear-selection="clearSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged } from '~/composables/useOfflineQueue'

const events = ref<any[]>([])
const query = ref('')
const { selectedEvent, selectedEventName } = useCheckout()
const { t } = useI18n()
const { formatLocalDateTime } = useLocaleFormatters()

function eventLabel(eventEntry: any) {
  return `${eventEntry.name} | ${formatLocalDateTime(eventEntry.starts_at)}`
}

const options = computed<SearchSelectOption[]>(() => events.value.map(eventEntry => ({
  key: eventEntry.id,
  label: eventLabel(eventEntry),
  value: eventEntry.id,
})))

const selectedLabel = computed(() => {
  const eventEntry = events.value.find(entry => entry.id === selectedEvent.value)
  return eventEntry ? eventLabel(eventEntry) : ''
})

// starts_at/ends_at are naive Berlin-local DATETIME strings ("YYYY-MM-DD HH:mm:ss"),
// so comparing against the current time formatted the same way avoids timezone math.
function berlinNowString() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })
}

function findActiveEvent(list: any[]) {
  const now = berlinNowString()
  return list.find(entry => String(entry.starts_at) <= now && now <= String(entry.ends_at))
}

watch(selectedLabel, (label) => {
  selectedEventName.value = label
}, { immediate: true })

function onSelect(value: unknown) {
  selectedEvent.value = Number(value)
  query.value = ''
}

function clearSelection() {
  selectedEvent.value = ''
}

async function loadEvents() {
  let result
  try {
    result = await cachedFetch<any>('/api/events')
  } catch {
    return
  }

  const res = result.data
  if (res.ok) {
    const allEvents = 'events' in res ? res.events as any[] : []
    events.value = allEvents
      .filter(i => i.is_active === 1 || i.is_active === true)
      .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)) || String(a.name).localeCompare(String(b.name)))

    if (!result.stale && selectedEvent.value && !events.value.some(entry => entry.id === selectedEvent.value)) {
      selectedEvent.value = ''
    }

    if (!selectedEvent.value) {
      const activeEvent = findActiveEvent(events.value)
      if (activeEvent) selectedEvent.value = Number(activeEvent.id)
    }
  }
}

onMounted(loadEvents)
useAppRefresh().onRefresh(loadEvents)
onOfflineDataChanged(loadEvents)
</script>
