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

const events = ref<any[]>([])
const query = ref('')
const { selectedEvent } = useCheckout()
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

function onSelect(value: unknown) {
  selectedEvent.value = Number(value)
  query.value = ''
}

function clearSelection() {
  selectedEvent.value = ''
}

async function loadEvents() {
  const res = await $fetch('/api/events', { method: 'GET' })
  if (res.ok) {
    const allEvents = 'events' in res ? res.events as any[] : []
    events.value = allEvents.filter(i => i.is_active === 1 || i.is_active === true)

    if (!selectedEvent.value) {
      const activeEvent = findActiveEvent(events.value)
      if (activeEvent) selectedEvent.value = Number(activeEvent.id)
    }
  }
}

onMounted(loadEvents)
useAppRefresh().onRefresh(loadEvents)
</script>
