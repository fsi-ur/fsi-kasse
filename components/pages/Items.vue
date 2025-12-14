<template>
  <Page headline1="Item Management" @open-menu="$emit('openMenu')">
    <template #cards>
      <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl flex gap-4 items-end">
        <div>
          <label class="block mb-1 text-md">Item Name</label>
          <input v-model="newItem.name" class="w-full p-2 rounded-md bg-gray-100 outline outline-gray-300" />
        </div>
        <div>
          <label class="block mb-1 text-md">Price</label>
          <input v-model="newItem.price" type="number" step="0.01" class="w-full p-2 rounded-md bg-gray-100 outline outline-gray-300" />
        </div>
        <div>
          <label class="block mb-1 text-md">Deposit</label>
          <input v-model="newItem.deposit" type="number" step="0.01" class="w-full p-2 rounded-md bg-gray-100 outline outline-gray-300" />
        </div>

        <button 
          @click="addItem"
          class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
        >
          Add
        </button>
      </div>

      <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">All Items</h2>
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-600">
              <th class="text-left pb-2">Name</th>
              <th class="text-left pb-2">Price</th>
              <th class="text-left pb-2">Deposit</th>
              <th class="text-left pb-2">Active</th>
              <th class="text-left pb-2"></th>
              <th class="text-left pb-2"></th>
            </tr>
          </thead>

          <tbody>
            <tr 
              v-for="item in items" 
              :key="item.id"
              class="border-b border-gray-700"
            >
              <td class="py-2">{{ item.name }}</td>
              <td class="py-2">{{ item.price }} €</td>
              <td class="py-2">{{ item.deposit }} €</td>
              <td class="p-2">
                <span :class="item.is_active ? 'text-green-600' : 'text-red-600'">
                  {{ item.is_active ? 'Yes' : 'No' }}
                </span>
              </td>
              <td class="py-2 text-right">
                <button 
                  @click="activateItem(item.id, item.is_active)"
                  class="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
                >
                  {{ item.is_active == 0 ? "Activate" : "Deactivate"}}
                </button>
              </td>
              <td class="py-2 text-right">
                <button 
                  @click="deleteItem(item.id)"
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

const items = ref<any[]>([])
const newItem = ref({
  name: '',
  price: '',
  deposit: ''
})

async function loadItems() {
  const res = await $fetch('/api/items', { method: 'GET' })
  if (res.ok) {
    items.value = 'items' in res ? res.items as any[] : []
  }
}

async function addItem() {
  if (!newItem.value.name || !newItem.value.price) return

  await $fetch('/api/items/create', {
    method: 'POST',
    body: newItem.value
  })

  newItem.value = { name: '', price: '', deposit: '' }
  await loadItems()
}

async function deleteItem(id: number) {
  await $fetch('/api/items/delete', {
    method: 'POST',
    body: { id }
  })

  await loadItems()
}

async function activateItem(id: number, status: number) {
  const is_active = status == 0 ? 1 : 0
  await $fetch('/api/items/activate', {
    method: 'POST',
    body: { id, is_active }
  })

  await loadItems()
}

onMounted(loadItems)
</script>