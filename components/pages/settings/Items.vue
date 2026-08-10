<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('items.allItems')"
    :singular-label="t('items.itemName')"
    :add-label="t('items.newItem')"
    :empty-label="t('items.none')"
    persist-key="settings-items"
    list-endpoint="/api/items"
    save-endpoint="/api/items/create"
    update-endpoint="/api/items/update"
    activate-endpoint="/api/items/activate"
    delete-endpoint="/api/items/delete"
    :delete-confirm-title="t('items.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('items.deleteConfirmQuestion', { name: item.name })"
    response-list-key="items"
    :extra-columns="columns"
    :create-item="() => ({ name: '', price: '', deposit: '' })"
    :map-edit-item="mapEditItem"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'green' : 'gray'"
      />
    </template>

    <template #modal-fields="{ editingItem: entity, isNewItem }">
      <div class="flex gap-4">
        <div class="field flex-1">
          <label>{{ t('common.price') }}</label>
          <input v-model="entity.price" type="number" step="0.01" min="0" class="input" />
        </div>
        <div class="field flex-1">
          <label>{{ t('common.deposit') }}</label>
          <input v-model="entity.deposit" type="number" step="0.01" min="0" class="input" />
        </div>
      </div>

      <p class="text-sm text-slate-600">{{ t('items.priceChangeNotice') }}</p>

      <div v-if="!isNewItem && priceHistory.length > 0" class="rounded-lg border border-slate-200 p-3">
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
            <span>{{ formatDateTime(entry.valid_from) }}</span>
            <span>{{ entry.name }}</span>
            <span>
              {{ formatCurrency(Number(entry.price)) }} / {{ formatCurrency(Number(entry.deposit)) }}
              <span v-if="entry.changed_by"> — {{ entry.changed_by }}</span>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </PagesSettingsEntityManager>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { EntityManagerColumn, SettingsEntityRow } from './EntityManager.vue'

const { t } = useI18n()
const toast = useToast()
const { formatCurrency, formatDateTime } = useLocaleFormatters()

const managerRef = ref<{ loadItems: () => Promise<void> } | null>(null)

// Beyond this many entries the price-history list scrolls instead of growing
// the modal indefinitely for a heavily-edited item. Rows get a fixed height so
// the max-height maps exactly to the row count instead of an approximation
// that leaves slack for a few extra rows before scrolling actually kicks in.
const PRICE_HISTORY_VISIBLE_LIMIT = 6
const PRICE_HISTORY_ROW_REM = 1.5

const priceHistory = ref<any[]>([])
const priceHistoryScrolls = computed(() => priceHistory.value.length > PRICE_HISTORY_VISIBLE_LIMIT)

const columns: EntityManagerColumn[] = [
  {
    key: 'price',
    label: t('common.price'),
    filterType: 'number',
    getValue: item => (item as any).price,
    format: item => formatCurrency(Number((item as any).price)),
  },
  {
    key: 'deposit',
    label: t('common.deposit'),
    filterType: 'number',
    getValue: item => (item as any).deposit ?? 0,
    format: item => formatCurrency(Number((item as any).deposit ?? 0)),
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

function mapEditItem(item: SettingsEntityRow) {
  const entity = item as unknown as { id: number, name: string, price: number, deposit: number }
  priceHistory.value = []
  loadPriceHistory(entity.id)
  return {
    id: entity.id,
    name: entity.name,
    price: String(Number(entity.price)),
    deposit: String(Number(entity.deposit ?? 0)),
  }
}

async function loadPriceHistory(id: number) {
  try {
    const res = await $fetch(`/api/items/${id}/history`, { method: 'GET' })
    if (res.ok && 'history' in res) priceHistory.value = res.history as any[]
  } catch {
    priceHistory.value = []
  }
}

function handleError(context: { phase: string, message?: string }) {
  if (context.phase === 'delete' && context.message === 'Item is used by existing orders') {
    toast.error(t('items.deleteBlockedByOrders'))
    return
  }

  toast.error(context.message || t('items.saveFailed'))
}

onMounted(() => {
  useAppRefresh().onRefresh(async () => {
    await managerRef.value?.loadItems()
  })
})
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
