<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Cashier Management</h1>
    <div class="mb-8 p-4 bg-white shadow-lg rounded-xl flex gap-4 items-end">
      <div>
        <label class="block mb-1 text-md">Cashier Name</label>
        <input v-model="newCashier.name" class="w-full p-2 rounded-md bg-gray-100 outline outline-gray-300" />
      </div>

      <button 
        @click="addCashier"
        class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
      >
        Add
      </button>
    </div>

    <div class="bg-white p-4 rounded-xl shadow-lg">
      <h2 class="text-xl font-semibold mb-4">All Cashiers</h2>
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-600">
            <th class="text-left pb-2">Name</th>
            <th class="text-left pb-2">Active</th>
          </tr>
        </thead>

        <tbody>
          <tr 
            v-for="cashier in cashiers" 
            :key="cashier.id"
            class="border-b border-gray-700"
          >
            <td class="py-2">{{ cashier.name }}</td>
            <td class="p-2">
              <span :class="cashier.is_active ? 'text-green-600' : 'text-red-600'">
                {{ cashier.is_active ? 'Yes' : 'No' }}
              </span>
            </td>
            <td class="py-2 text-right">
              <button 
                @click="activateCashier(cashier.id, cashier.is_active)"
                class="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded-md text-white cursor-pointer"
              >
                {{ cashier.is_active == 0 ? "Activate" : "Deactivate"}}
              </button>
            </td>
            <td class="py-2 text-right">
              <button 
                @click="deleteCashier(cashier.id)"
                class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-white cursor-pointer"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const cashiers = ref<any[]>([])
const newCashier = ref({
  name: ''
})

async function loadCashiers() {
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok) {
    cashiers.value = 'cashiers' in res ? res.cashiers as any[] : []
  }
}

async function addCashier() {
  if (!newCashier.value.name) return

  await $fetch('/api/cashiers/create', {
    method: 'POST',
    body: newCashier.value
  })

  newCashier.value = { name: '' }
  await loadCashiers()
}

async function deleteCashier(id: number) {
  await $fetch('/api/cashiers/delete', {
    method: 'POST',
    body: { id }
  })

  await loadCashiers()
}

async function activateCashier(id: number, status: number) {
  const is_active = status == 0 ? 1 : 0
  await $fetch('/api/cashiers/activate', {
    method: 'POST',
    body: { id, is_active }
  })

  await loadCashiers()
}

onMounted(loadCashiers)
</script>