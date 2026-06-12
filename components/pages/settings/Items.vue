<template>
  <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl">
    <h2 class="text-lg font-semibold mb-4">{{ t('items.newItem') }}</h2>
    <div class="flex flex-wrap gap-4 items-end">
      <div class="field w-48">
        <label>{{ t('items.itemName') }}</label>
        <input v-model="newItem.name" class="input" />
      </div>
      <div class="field w-32">
        <label>{{ t('common.price') }}</label>
        <input v-model="newItem.price" type="number" step="0.01" class="input" />
      </div>
      <div class="field w-32">
        <label>{{ t('common.deposit') }}</label>
        <input v-model="newItem.deposit" type="number" step="0.01" class="input" />
      </div>

      <button
        @click="addItem"
        class="btn-primary"
        :disabled="!newItem.name || !newItem.price"
      >
        {{ t('actions.add') }}
      </button>
    </div>
  </div>

  <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
    <h2 class="text-lg font-semibold mb-4">{{ t('items.allItems') }}</h2>
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-300 text-slate-600">
          <th class="text-left pb-2 font-semibold">{{ t('common.name') }}</th>
          <th class="text-left pb-2 font-semibold">{{ t('common.price') }}</th>
          <th class="text-left pb-2 font-semibold">{{ t('common.deposit') }}</th>
          <th class="text-left pb-2 font-semibold">{{ t('common.active') }}</th>
          <th class="text-left pb-2"></th>
          <th class="text-left pb-2"></th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="item in items"
          :key="item.id"
          class="border-b border-slate-200"
        >
          <td class="py-2">{{ item.name }}</td>
          <td class="py-2">{{ item.price }} €</td>
          <td class="py-2">{{ item.deposit }} €</td>
          <td class="p-2">
            <span :class="item.is_active ? 'text-green-600' : 'text-red-600'">
              {{ item.is_active ? t('common.yes') : t('common.no') }}
            </span>
          </td>
          <td class="py-2 text-right">
            <button
              @click="activateItem(item.id, item.is_active)"
              class="btn-secondary px-3 py-1"
            >
              {{ item.is_active == 0 ? t('actions.activate') : t('actions.deactivate') }}
            </button>
          </td>
          <td class="py-2 text-right">
            <button
              @click="itemToDelete = item"
              class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-white text-sm cursor-pointer"
            >
              {{ t('actions.remove') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="items.length === 0" class="text-gray-400 mt-4">
      {{ t('items.none') }}
    </div>
  </div>

  <FormConfirmation
    v-if="itemToDelete"
    :headline="t('items.deleteConfirmTitle')"
    @confirm="deleteItem"
    @cancel="itemToDelete = null"
  >
    <template #message>
      {{ t('items.deleteConfirmQuestion', { name: itemToDelete.name }) }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

const items = ref<any[]>([])
const itemToDelete = ref<any | null>(null)
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

async function deleteItem() {
  if (!itemToDelete.value) return

  await $fetch('/api/items/delete', {
    method: 'POST',
    body: { id: itemToDelete.value.id }
  })

  itemToDelete.value = null
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
useAppRefresh().onRefresh(loadItems)
</script>
