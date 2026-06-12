<template>
  <div
    v-if="!readOnly"
    class="col-span-12 p-4 bg-white shadow-lg rounded-xl"
  >
    <h2 class="text-lg font-semibold mb-4">{{ t('events.newEvent') }}</h2>
    <div class="flex flex-wrap gap-4 items-end">
      <div class="field w-64">
        <label>{{ t('events.eventName') }}</label>
        <input v-model="newEvent.name" class="input" />
      </div>

      <button
        @click="addEvent"
        class="btn-primary"
        :disabled="!newEvent.name"
      >
        {{ t('actions.add') }}
      </button>
    </div>
  </div>

  <div
    v-else
    class="col-span-12 p-4 bg-amber-50 text-amber-900 shadow-lg rounded-xl border border-amber-200 text-sm"
  >
    {{ t('events.connectedNotice') }}
  </div>

  <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
    <h2 class="text-lg font-semibold mb-4">{{ t('events.allEvents') }}</h2>
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="text-left pb-2 font-semibold">{{ t('common.name') }}</th>
          <th class="text-left pb-2 font-semibold">{{ t('common.active') }}</th>
          <th v-if="!readOnly" class="text-left pb-2"></th>
          <th v-if="!readOnly" class="text-left pb-2"></th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="event in events"
          :key="event.id"
          class="border-b border-slate-200"
        >
          <td class="py-2 text-left">{{ event.name }}</td>
          <td class="py-2 text-left">
            <span :class="event.is_active ? 'text-green-600' : 'text-red-600'">
              {{ event.is_active ? t('common.yes') : t('common.no') }}
            </span>
          </td>
          <td v-if="!readOnly" class="py-2 text-right">
            <button
              @click="activateEvent(event.id, event.is_active)"
              class="btn-secondary px-3 py-1"
            >
              {{ event.is_active == 0 ? t('actions.activate') : t('actions.deactivate') }}
            </button>
          </td>
          <td v-if="!readOnly" class="py-2 text-right">
            <button
              @click="eventToDelete = event"
              class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-white text-sm cursor-pointer"
            >
              {{ t('actions.remove') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="events.length === 0" class="text-gray-400 mt-4">
      {{ t('events.none') }}
    </div>
  </div>

  <FormConfirmation
    v-if="eventToDelete"
    :headline="t('events.deleteConfirmTitle')"
    @confirm="deleteEvent"
    @cancel="eventToDelete = null"
  >
    <template #message>
      {{ t('events.deleteConfirmQuestion', { name: eventToDelete.name }) }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const events = ref<any[]>([])
const readOnly = ref(false)
const eventToDelete = ref<any | null>(null)
const newEvent = ref({
  name: ''
})

async function loadEvents() {
  const res = await $fetch('/api/events', { method: 'GET' })
  if (res.ok) {
    events.value = 'events' in res ? res.events as any[] : []
    readOnly.value = 'read_only' in res ? Boolean(res.read_only) : false
  }
}

async function addEvent() {
  if (!newEvent.value.name) return

  await $fetch('/api/events/create', {
    method: 'POST',
    body: newEvent.value
  })

  newEvent.value = { name: '' }
  await loadEvents()
}

async function deleteEvent() {
  if (!eventToDelete.value) return

  await $fetch('/api/events/delete', {
    method: 'POST',
    body: { id: eventToDelete.value.id }
  })

  eventToDelete.value = null
  await loadEvents()
}

async function activateEvent(id: number, status: number) {
  const is_active = status == 0 ? 1 : 0
  await $fetch('/api/events/activate', {
    method: 'POST',
    body: { id, is_active }
  })

  await loadEvents()
}

onMounted(loadEvents)
useAppRefresh().onRefresh(loadEvents)
</script>
