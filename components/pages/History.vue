<template>
  <Page :headline1="t('history.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectEvent class="ml-auto" />
    </template>

    <template #cards>
      <div v-if="loading" class="col-span-12 text-gray-500">{{ t('common.loading') }}</div>

      <CommonPageTableCard
        v-else
        :title="t('history.title')"
        persist-key="history-orders"
        :search-value="search"
        @update:search-value="search = $event"
      >
        <CommonAdvancedTable
          v-model:search="search"
          persist-key="history-orders"
          :rows="orders"
          :columns="columns"
          :empty-text="t('history.noOrders')"
          :show-actions="false"
          @row-open="openOrder"
        >
          <template #cell-type="{ row }">
            <CommonStatusBadge
              v-if="row.is_fachschaft"
              :label="t('history.fachschaftBadge')"
              tone="green"
            />
            <span v-else>{{ t('history.typeSale') }}</span>
          </template>

          <!-- Compact cards read as a receipt line, not as a list of table cells. -->
          <template #mobile-title="{ row }">
            {{ t('history.order', { id: row.id }) }} — {{ t('common.total') }}:
            {{ formatCurrency(row.is_fachschaft ? 0 : orderTotal(row)) }}
          </template>

          <template #mobile-meta="{ row }">
            <span class="truncate">
              {{ t('history.cashier', { name: row.cashier }) }} — {{ formatDateTime(row.created_at) }}
            </span>
            <CommonStatusBadge
              v-if="row.is_fachschaft"
              :label="t('history.fachschaftBadge')"
              tone="green"
            />
          </template>
        </CommonAdvancedTable>
      </CommonPageTableCard>
    </template>
  </Page>

  <CommonModal v-model="showOrderModal" :title="openedOrder ? t('history.order', { id: openedOrder.id }) : ''">
    <ul v-if="openedOrder">
      <li
        v-for="item in openedOrder.items"
        :key="item.id"
        class="grid grid-cols-6 py-2 border-b border-slate-200"
      >
        <span class="col-span-1">{{ item.quantity }}</span>
        <span class="col-span-3">{{ item.name }}
          <span
            v-if="item.deposit > 0"
            class="text-xs text-gray-500"
          >
            {{ t('checkout.depositSuffix', { amount: formatCurrency(item.deposit) }) }}
          </span>
        </span>
        <span class="col-span-2 text-right">
          {{ formatCurrency((Number(item.price) + Number(item.deposit)) * item.quantity) }}
        </span>
      </li>
    </ul>

    <div v-if="openedOrder" class="text-right font-bold mt-3">
      {{ t('common.total') }}: {{ formatCurrency(orderTotal(openedOrder)) }}
    </div>

    <template #footer>
      <button class="btn-secondary" @click="showOrderModal = false">
        {{ t('actions.close') }}
      </button>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

const { selectedEvent } = useCheckout()
const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const { onRefresh } = useAppRefresh()

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const orders = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const showOrderModal = ref(false)
const openedOrder = ref<any | null>(null)

function orderTotal(order: any) {
  return order.items
    .reduce((s: number, i: any) => s + (Number(i.price) + Number(i.deposit)) * Number(i.quantity), 0)
}

const columns: AdvancedTableColumn<any>[] = [
  {
    key: 'id',
    label: t('users.id'),
    filterType: 'number',
    getValue: order => order.id,
  },
  {
    key: 'cashier',
    label: t('history.cashierLabel'),
    globalSearchable: true,
    getValue: order => order.cashier,
  },
  {
    key: 'created_at',
    label: t('users.createdAt'),
    filterType: 'date',
    getValue: order => order.created_at,
    format: order => formatDateTime(order.created_at),
  },
  {
    key: 'total',
    label: t('common.total'),
    filterType: 'number',
    getValue: order => order.is_fachschaft ? 0 : orderTotal(order),
    format: order => formatCurrency(order.is_fachschaft ? 0 : orderTotal(order)),
  },
  {
    key: 'type',
    label: t('history.type'),
    filterable: true,
    globalSearchable: true,
    getValue: order => order.is_fachschaft ? t('history.fachschaftBadge') : t('history.typeSale'),
  },
]

function openOrder(order: any) {
  openedOrder.value = order
  showOrderModal.value = true
}

async function loadHistory() {
  const res = await $fetch(`/api/orders/history?eventId=${selectedEvent.value}`)

  if (res.ok) orders.value = 'orders' in res ? res.orders : []
  loading.value = false
}

onMounted(loadHistory)
onRefresh(loadHistory)

watch(selectedEvent, () => {
  loadHistory()
})
</script>
