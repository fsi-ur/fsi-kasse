<template>
  <Page headline1="Event Management" @open-menu="$emit('openMenu')">
    <template #cards>
      <div
        v-if="!readOnly"
        class="col-span-12 p-4 bg-white shadow-lg rounded-xl flex flex-wrap gap-4 items-end"
      >
        <div>
          <label class="block mb-1 text-md">Event Name</label>
          <input v-model="newEvent.name" class="w-full p-2 rounded-md bg-gray-100 outline outline-gray-300" />
        </div>

        <button 
          @click="addEvent"
          class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
        >
          Add
        </button>
      </div>

      <div
        v-else
        class="col-span-12 p-4 bg-amber-50 text-amber-900 shadow-lg rounded-xl border border-amber-200"
      >
        Events are managed by Buchhaltung in connected mode. Kassensystem can use those events, but it cannot create, edit, activate, or delete them here.
      </div>

      <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">All Events</h2>
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-600">
              <th class="text-left pb-2">Name</th>
              <th class="text-left pb-2">Active</th>
              <th v-if="!readOnly" class="text-left pb-2"></th>
              <th v-if="!readOnly" class="text-left pb-2"></th>
            </tr>
          </thead>

          <tbody>
            <tr 
              v-for="event in events" 
              :key="event.id"
              class="border-b border-gray-700"
            >
              <td class="py-2 text-left">{{ event.name }}</td>
              <td class="py-2 text-left">
                <span :class="event.is_active ? 'text-green-600' : 'text-red-600'">
                  {{ event.is_active ? 'Yes' : 'No' }}
                </span>
              </td>
              <td v-if="!readOnly" class="py-2 text-right">
                <button 
                  @click="activateEvent(event.id, event.is_active)"
                  class="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
                >
                  {{ event.is_active == 0 ? "Activate" : "Deactivate"}}
                </button>
              </td>
              <td v-if="!readOnly" class="py-2 text-right">
                <button 
                  @click="deleteEvent(event.id)"
                  class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-white cursor-pointer"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </Page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const events = ref<any[]>([])
const readOnly = ref(false)
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

async function deleteEvent(id: number) {
  await $fetch('/api/events/delete', {
    method: 'POST',
    body: { id }
  })

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
</script>
