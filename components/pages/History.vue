<template>
  <Page :headline1="t('history.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectEvent class="ml-auto" />
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="stale" :variant="cachedAt ? 'stale' : 'noData'" :cached-at="cachedAt" />

      <CommonPageTableCard
        v-if="!stale || cachedAt"
        :title="t('history.title')"
        persist-key="history-orders"
        :search-value="search"
        @update:search-value="search = $event"
      >
        <CommonAdvancedTable
          v-model:search="search"
          persist-key="history-orders"
          :rows="orders"
          :loading="loading"
          :columns="columns"
          :empty-text="t('history.noOrders')"
          :show-actions="false"
          :row-key="entryKey"
          @row-open="openOrder"
        >
          <template #cell-type="{ row }">
            <CommonStatusBadge
              v-if="isDonationOnly(row)"
              :label="t('history.typeDonation')"
              tone="warning"
            />
            <CommonStatusBadge
              v-else-if="row.is_fachschaft"
              :label="t('history.fachschaftBadge')"
              tone="success"
            />
            <span v-else>{{ t('history.typeSale') }}</span>
          </template>

          <!-- Compact cards read as a receipt line, not as a list of table cells. -->
          <template #mobile-title="{ row }">
            {{ entryTitle(row) }} — {{ t('common.total') }}:
            {{ formatCurrency(entryTotal(row)) }}
          </template>

          <template #mobile-meta="{ row }">
            <span class="truncate">
              {{ t('history.cashier', { name: row.cashier }) }}<template v-if="row.stand"> · {{ t('history.standLabel', { name: row.stand }) }}</template>
              — {{ formatDateTime(row.created_at) }}
            </span>
            <CommonStatusBadge
              v-if="isDonationOnly(row)"
              :label="t('history.typeDonation')"
              tone="warning"
            />
            <CommonStatusBadge
              v-else-if="row.is_fachschaft"
              :label="t('history.fachschaftBadge')"
              tone="success"
            />
          </template>
        </CommonAdvancedTable>
      </CommonPageTableCard>
    </template>
  </Page>

  <CommonModal v-model="showOrderModal" :title="openedOrder ? entryTitle(openedOrder) : ''">
    <dl v-if="openedOrder" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-3 mb-2 border-b border-base-200">
      <dt class="text-base-500">{{ t('users.id') }}</dt>
      <dd class="text-right">{{ isDonationOnly(openedOrder) ? `#${openedOrder.donation_id}` : `#${openedOrder.id}` }}</dd>
      <dt class="text-base-500">{{ t('history.type') }}</dt>
      <dd class="text-right">
        {{ isDonationOnly(openedOrder)
          ? t('history.typeDonation')
          : openedOrder.is_fachschaft ? t('history.fachschaftBadge') : t('history.typeSale') }}
      </dd>
      <dt class="text-base-500">{{ t('history.date') }}</dt>
      <dd class="text-right">{{ formatDateTime(openedOrder.created_at) }}</dd>
      <dt class="text-base-500">{{ t('history.cashierLabel') }}</dt>
      <dd class="text-right">{{ openedOrder.cashier }}</dd>
      <dt class="text-base-500">{{ t('history.stand') }}</dt>
      <dd class="text-right">{{ openedOrder.stand || t('history.noStand') }}</dd>
    </dl>

    <ul v-if="openedOrder">
      <li
        v-for="item in openedOrder.items"
        :key="item.id"
        class="grid grid-cols-6 py-2 border-b border-base-200"
      >
        <span class="col-span-1">{{ item.quantity }}</span>
        <span class="col-span-3">{{ item.name }}
          <span
            v-if="item.deposit > 0"
            class="text-xs text-base-500"
          >
            {{ t('checkout.depositSuffix', { amount: formatCurrency(item.deposit) }) }}
          </span>
        </span>
        <span class="col-span-2 text-right">
          {{ formatCurrency((Number(item.price) + Number(item.deposit)) * item.quantity) }}
        </span>
      </li>
    </ul>

    <div v-if="openedOrder && openedOrder.donation > 0" class="flex justify-between py-2 border-b border-base-200">
      <span>{{ t('history.donation') }}</span>
      <span>{{ formatCurrency(openedOrder.donation) }}</span>
    </div>

    <div v-if="openedOrder" class="text-right font-bold mt-3">
      {{ t('common.total') }}: {{ formatCurrency(entryTotal(openedOrder)) }}
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
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged } from '~/composables/useOfflineQueue'

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
const stale = ref(false)
const cachedAt = ref<number | null>(null)

function orderTotal(order: any) {
  return order.items
    .reduce((s: number, i: any) => s + (Number(i.price) + Number(i.deposit)) * Number(i.quantity), 0)
}

// Direct donations have no order and show up as their own history entry
function isDonationOnly(entry: any) {
  return entry.id == null
}

function entryKey(entry: any) {
  return isDonationOnly(entry) ? `donation-${entry.donation_id}` : `order-${entry.id}`
}

function entryTitle(entry: any) {
  return isDonationOnly(entry)
    ? t('history.donationEntry', { id: entry.donation_id })
    : t('history.order', { id: entry.id })
}

// Sale total (free for Fachschaft orders) plus the donation paid on top
function entryTotal(entry: any) {
  return (entry.is_fachschaft ? 0 : orderTotal(entry)) + Number(entry.donation ?? 0)
}

// The stand column only appears once an order of this event has a stand
const hasStands = computed(() => orders.value.some(order => order.stand))

const columns = computed<AdvancedTableColumn<any>[]>(() => [
  {
    key: 'id',
    label: t('users.id'),
    filterType: 'number',
    getValue: order => order.id ?? '',
    format: order => isDonationOnly(order) ? '–' : String(order.id),
  },
  {
    key: 'cashier',
    label: t('history.cashierLabel'),
    globalSearchable: true,
    getValue: order => order.cashier,
  },
  ...(hasStands.value
    ? [{
        key: 'stand',
        label: t('history.stand'),
        globalSearchable: true,
        getValue: (order: any) => order.stand ?? '',
      }]
    : []),
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
    getValue: order => entryTotal(order),
    format: order => formatCurrency(entryTotal(order)),
  },
  {
    key: 'type',
    label: t('history.type'),
    filterable: true,
    globalSearchable: true,
    getValue: order => isDonationOnly(order)
      ? t('history.typeDonation')
      : order.is_fachschaft ? t('history.fachschaftBadge') : t('history.typeSale'),
  },
])

function openOrder(order: any) {
  openedOrder.value = order
  showOrderModal.value = true
}

async function loadHistory() {
  try {
    const result = await cachedFetch<any>(`/api/orders/history?eventId=${selectedEvent.value}`)
    stale.value = result.stale
    cachedAt.value = result.cachedAt
    if (result.data.ok) orders.value = 'orders' in result.data ? result.data.orders : []
  } catch {
    orders.value = []
    stale.value = true
    cachedAt.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadHistory)
onRefresh(loadHistory)
onOfflineDataChanged(loadHistory)

watch(selectedEvent, () => {
  loading.value = true
  loadHistory()
})
</script>
