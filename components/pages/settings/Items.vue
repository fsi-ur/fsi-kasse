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
        :disabled="!canAddItem"
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
          <td class="py-2">{{ Number(item.price).toFixed(2) }} €</td>
          <td class="py-2">{{ Number(item.deposit ?? 0).toFixed(2) }} €</td>
          <td class="p-2">
            <span :class="item.is_active ? 'text-green-600' : 'text-red-600'">
              {{ item.is_active ? t('common.yes') : t('common.no') }}
            </span>
          </td>
          <td class="py-2 text-right">
            <button
              @click="startEdit(item)"
              class="btn-secondary px-3 py-1"
            >
              {{ t('actions.edit') }}
            </button>
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

  <CommonModal
    v-model="isEditing"
    :title="t('items.editItem')"
    width-class="max-w-lg"
    @close="cancelEdit"
  >
    <div v-if="editItemState" class="space-y-4">
      <div class="field">
        <label>{{ t('items.itemName') }}</label>
        <input v-model="editItemState.name" class="input" />
      </div>
      <div class="flex gap-4">
        <div class="field flex-1">
          <label>{{ t('common.price') }}</label>
          <input v-model="editItemState.price" type="number" step="0.01" min="0" class="input" />
        </div>
        <div class="field flex-1">
          <label>{{ t('common.deposit') }}</label>
          <input v-model="editItemState.deposit" type="number" step="0.01" min="0" class="input" />
        </div>
      </div>

      <p class="text-sm text-slate-600">{{ t('items.priceChangeNotice') }}</p>

      <div v-if="priceHistory.length > 0" class="rounded-lg border border-slate-200 p-3">
        <h4 class="font-semibold text-sm mb-2">{{ t('items.priceHistory') }}</h4>
        <ul
          class="text-xs text-slate-600"
          :class="priceHistoryScrolls ? 'price-history-scroll pr-2' : ''"
          :style="priceHistoryScrolls ? { maxHeight: `${PRICE_HISTORY_ROW_REM * PRICE_HISTORY_VISIBLE_LIMIT}rem`, overflowY: 'auto' } : {}"
        >
          <li
            v-for="entry in priceHistory"
            :key="entry.valid_from + entry.price"
            class="flex justify-between items-center gap-4 border-b border-slate-100 last:border-b-0"
            :style="{ height: `${PRICE_HISTORY_ROW_REM}rem` }"
          >
            <span>{{ formatDate(entry.valid_from) }}</span>
            <span>{{ entry.name }}</span>
            <span>
              {{ Number(entry.price).toFixed(2) }} € / {{ Number(entry.deposit).toFixed(2) }} €
              <span v-if="entry.changed_by"> — {{ entry.changed_by }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" :disabled="isSaving" @click="cancelEdit">
        {{ t('actions.cancel') }}
      </button>
      <button class="btn-primary" :disabled="isSaving || !editItemState?.name" @click="saveEdit">
        {{ t('actions.save') }}
      </button>
    </template>
  </CommonModal>

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
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'

const { t, locale } = useI18n()
const toast = useToast()

const items = ref<any[]>([])
const itemToDelete = ref<any | null>(null)
const newItem = ref({
  name: '',
  price: '',
  deposit: ''
})

// A price of 0 is legitimate (free item), so this checks the number, not truthiness.
const canAddItem = computed(() => {
  const price = Number(newItem.value.price)
  return Boolean(newItem.value.name.trim()) && newItem.value.price !== '' && Number.isFinite(price) && price >= 0
})

// Beyond this many entries the price-history list scrolls instead of growing
// the modal indefinitely for a heavily-edited item. Rows get a fixed height so
// the max-height maps exactly to the row count instead of an approximation
// that leaves slack for a few extra rows before scrolling actually kicks in.
const PRICE_HISTORY_VISIBLE_LIMIT = 6
const PRICE_HISTORY_ROW_REM = 1.5

const priceHistoryScrolls = computed(() => priceHistory.value.length > PRICE_HISTORY_VISIBLE_LIMIT)

const editItemState = ref<{ id: number, name: string, price: string, deposit: string } | null>(null)
const priceHistory = ref<any[]>([])
const isSaving = ref(false)
const isEditing = computed({
  get: () => editItemState.value !== null,
  set: (value: boolean) => { if (!value) cancelEdit() },
})

function formatDate(ts: string | Date) {
  const d = typeof ts === 'string' && !/[Z+\-]\d{2}:?\d{2}$/.test(ts) && !ts.endsWith('Z')
    ? new Date(ts.replace(' ', 'T') + 'Z')
    : new Date(ts)
  return d.toLocaleString(locale.value, { timeZone: 'Europe/Berlin' })
}

async function loadItems() {
  const res = await $fetch('/api/items', { method: 'GET' })
  if (res.ok) {
    items.value = 'items' in res ? res.items as any[] : []
  }
}

async function addItem() {
  if (!canAddItem.value) return

  const res = await $fetch('/api/items/create', {
    method: 'POST',
    body: {
      name: newItem.value.name,
      price: Number(newItem.value.price),
      deposit: Number(newItem.value.deposit || 0),
    }
  })

  if (!res.ok) {
    toast.error('error' in res && res.error ? String(res.error) : t('items.saveFailed'))
    return
  }

  newItem.value = { name: '', price: '', deposit: '' }
  await loadItems()
}

function startEdit(item: any) {
  editItemState.value = {
    id: Number(item.id),
    name: String(item.name),
    price: String(Number(item.price)),
    deposit: String(Number(item.deposit ?? 0)),
  }
  priceHistory.value = []
  loadPriceHistory(Number(item.id))
}

function cancelEdit() {
  editItemState.value = null
  priceHistory.value = []
}

async function loadPriceHistory(id: number) {
  try {
    const res = await $fetch(`/api/items/${id}/history`, { method: 'GET' })
    if (res.ok && 'history' in res) priceHistory.value = res.history as any[]
  } catch {
    priceHistory.value = []
  }
}

async function saveEdit() {
  if (!editItemState.value || isSaving.value) return

  isSaving.value = true
  try {
    const res = await $fetch('/api/items/update', {
      method: 'POST',
      body: {
        id: editItemState.value.id,
        name: editItemState.value.name,
        price: Number(editItemState.value.price),
        deposit: Number(editItemState.value.deposit || 0),
      }
    })

    if (!res.ok) {
      toast.error('error' in res && res.error ? String(res.error) : t('items.saveFailed'))
      return
    }

    cancelEdit()
    toast.success(t('items.saved'))
    await loadItems()
  } catch {
    toast.error(t('items.saveFailed'))
  } finally {
    isSaving.value = false
  }
}

async function deleteItem() {
  if (!itemToDelete.value) return

  const res = await $fetch('/api/items/delete', {
    method: 'POST',
    body: { id: itemToDelete.value.id }
  })

  itemToDelete.value = null

  if (!res.ok) {
    toast.error('code' in res && res.code === 'item_in_use'
      ? t('items.deleteBlockedByOrders')
      : ('error' in res && res.error ? String(res.error) : t('items.saveFailed')))
    return
  }

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

<style scoped>
/* Cosmetic only — overflow-y itself is set inline once priceHistoryScrolls is
   true. These rules keep the thumb visibly styled instead of relying on
   OS/browser auto-hide/overlay scrollbar behavior. */
.price-history-scroll {
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 #f1f5f9; /* slate-400 / slate-100 */
}

.price-history-scroll::-webkit-scrollbar {
  width: 8px;
}

.price-history-scroll::-webkit-scrollbar-track {
  background: #f1f5f9; /* slate-100 */
  border-radius: 9999px;
}

.price-history-scroll::-webkit-scrollbar-thumb {
  background-color: #94a3b8; /* slate-400 */
  border-radius: 9999px;
}
</style>
