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
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

const events = ref<any[]>([])
const query = ref('')
const { selectedEvent } = useCheckout()
const { t } = useI18n()

const options = computed<SearchSelectOption[]>(() => events.value.map(eventEntry => ({
  key: eventEntry.id,
  label: String(eventEntry.name),
  value: eventEntry.id,
})))

const selectedLabel = computed(() => {
  const eventEntry = events.value.find(entry => entry.id === selectedEvent.value)
  return eventEntry ? String(eventEntry.name) : ''
})

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
  }
}

onMounted(loadEvents)
useAppRefresh().onRefresh(loadEvents)
</script>
