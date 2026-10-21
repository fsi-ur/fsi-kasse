<template>
  <CommonOfflineNotice v-if="!isOnline" variant="unavailable" />

  <CommonPageTableCard
    v-else
    :title="t('cardPayments.title')"
    persist-key="card-payments"
    :search-value="search"
    @update:search-value="search = $event"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm cursor-pointer transition-colors"
        :class="problemsOnly
          ? 'border-accent-500 bg-accent-50 text-accent-700'
          : 'border-base-300 text-base-600 hover:bg-base-50'"
        :aria-pressed="problemsOnly"
        @click="problemsOnly = !problemsOnly"
      >
        <Icon
          :name="problemsOnly ? 'material-symbols:filter-alt' : 'material-symbols:filter-alt-outline'"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        {{ t('cardPayments.problemsOnly') }}
      </button>
    </template>

    <CommonAdvancedTable
      v-model:search="search"
      persist-key="card-payments"
      :rows="payments"
      :loading="loading"
      :columns="columns"
      :empty-text="problemsOnly ? t('cardPayments.noProblems') : t('cardPayments.none')"
      :show-actions="false"
      :row-key="row => row.client_uuid"
      @row-open="openPayment"
    >
      <template #cell-status="{ row }">
        <CommonStatusBadge :label="statusLabel(row)" :tone="statusTone(row)" />
      </template>

      <template #mobile-title="{ row }">
        {{ formatCurrency(row.charged_amount ?? row.amount) }} — {{ row.event_name ?? `#${row.event_id}` }}
      </template>

      <template #mobile-meta="{ row }">
        <span class="truncate">
          {{ [row.stand_name, row.cashier_name].filter(Boolean).join(' · ') }} — {{ formatDateTime(row.created_at) }}
        </span>
        <CommonStatusBadge :label="statusLabel(row)" :tone="statusTone(row)" />
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <CommonModal
    v-model="showModal"
    :title="t('cardPayments.detailTitle')"
    width-class="max-w-xl"
  >
    <template v-if="opened">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-3 border-b border-base-200 text-sm">
        <dt class="text-base-500">{{ t('cardPayments.status') }}</dt>
        <dd class="text-right"><CommonStatusBadge :label="statusLabel(opened)" :tone="statusTone(opened)" /></dd>
        <dt class="text-base-500">{{ t('cardPayments.kind') }}</dt>
        <dd class="text-right">{{ opened.kind === 'checkout' ? t('cardPayments.kindCheckout') : t('cardPayments.kindFachschaft') }}</dd>
        <dt class="text-base-500">{{ t('orderChanges.event') }}</dt>
        <dd class="text-right">{{ opened.event_name ?? `#${opened.event_id}` }}</dd>
        <dt class="text-base-500">{{ t('history.stand') }}</dt>
        <dd class="text-right">{{ opened.stand_name ?? t('history.noStand') }}</dd>
        <dt class="text-base-500">{{ t('cardPayments.terminal') }}</dt>
        <dd class="text-right">{{ opened.reader_name ?? t('common.notAvailable') }}</dd>
        <dt class="text-base-500">{{ t('history.cashierLabel') }}</dt>
        <dd class="text-right">{{ opened.cashier_name ?? t('common.notAvailable') }}</dd>
        <dt class="text-base-500">{{ t('cardPayments.startedAt') }}</dt>
        <dd class="text-right">{{ formatDateTime(opened.created_at) }}</dd>
        <dt class="text-base-500">{{ t('cardPayments.amount') }}</dt>
        <dd class="text-right">{{ formatCurrency(opened.amount) }}</dd>
        <template v-if="opened.charged_amount != null">
          <dt class="text-base-500">{{ t('cardPayments.charged') }}</dt>
          <dd class="text-right">{{ formatCurrency(opened.charged_amount) }}</dd>
        </template>
        <template v-if="opened.tip_amount">
          <dt class="text-base-500">{{ t('cardPayments.tip') }}</dt>
          <dd class="text-right">{{ formatCurrency(opened.tip_amount) }}</dd>
        </template>
        <template v-if="opened.transaction_code">
          <dt class="text-base-500">{{ t('card.transactionCode') }}</dt>
          <dd class="text-right font-mono">{{ opened.transaction_code }}</dd>
        </template>
        <template v-if="opened.order_id">
          <dt class="text-base-500">{{ t('orderChanges.order') }}</dt>
          <dd class="text-right">#{{ opened.order_id }}</dd>
        </template>
      </dl>

      <p v-if="opened.booking_error" class="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-900">
        {{ opened.booking_error }}
      </p>
      <p v-else-if="opened.failure_reason" class="rounded-lg bg-base-100 px-3 py-2 text-sm text-base-700">
        {{ opened.failure_reason }}
      </p>
      <p v-if="opened.is_stale" class="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">
        {{ t('cardPayments.staleHint') }}
      </p>

      <div v-if="opened.resolution_note">
        <p class="section-title">{{ t('cardPayments.resolutionNote') }}</p>
        <p class="text-sm whitespace-pre-line">{{ opened.resolution_note }}</p>
        <p v-if="opened.resolved_by" class="text-xs text-base-500">{{ opened.resolved_by }}</p>
      </div>

      <div v-if="canResolve(opened)">
        <label for="card-payment-note" class="section-title block">{{ t('cardPayments.resolutionNote') }}</label>
        <textarea
          id="card-payment-note"
          v-model="note"
          class="input"
          rows="2"
          maxlength="1000"
          :placeholder="t('cardPayments.resolutionPlaceholder')"
        />
      </div>
    </template>

    <template #footer>
      <button class="btn-secondary" :class="{ 'mr-auto': opened && hasActions(opened) }" :disabled="busy" @click="showModal = false">
        {{ t('actions.close') }}
      </button>
      <template v-if="opened">
        <button v-if="canRecheck(opened)" class="btn-outline" :disabled="busy" @click="recheck(false)">
          {{ t('cardPayments.recheck') }}
        </button>
        <button v-if="opened.status === 'booking_failed'" class="btn-outline" :disabled="busy" @click="recheck(true)">
          {{ t('cardPayments.retryBooking') }}
        </button>
        <button v-if="canResolve(opened)" class="btn-primary" :disabled="busy || !note.trim()" @click="resolve">
          {{ t('cardPayments.resolve') }}
        </button>
      </template>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useToast } from '~/composables/useToast'
import { useConnectivity } from '~/composables/useConnectivity'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

interface CardPaymentRow {
  client_uuid: string
  kind: 'checkout' | 'fachschaft_payment'
  status: string
  event_id: number
  event_name: string | null
  stand_name: string | null
  reader_name: string | null
  cashier_name: string | null
  amount: number
  tip_amount: number | null
  charged_amount: number | null
  fee_amount: number | null
  transaction_code: string | null
  failure_reason: string | null
  booking_error: string | null
  resolution_note: string | null
  resolved_by: string | null
  created_at: string
  order_id: number | null
  is_problem: boolean
  is_stale: boolean
}

const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const { onRefresh } = useAppRefresh()
const toast = useToast()
const { isOnline, onOnline } = useConnectivity()

const payments = ref<CardPaymentRow[]>([])
const loading = ref(true)
const search = ref('')
const problemsOnly = ref(true)
const showModal = ref(false)
const opened = ref<CardPaymentRow | null>(null)
const note = ref('')
const busy = ref(false)

function statusLabel(row: CardPaymentRow) {
  if (row.is_stale) return t('cardPayments.statusStale')
  switch (row.status) {
    case 'booked': return t('cardPayments.statusBooked')
    case 'failed': return t('cardPayments.statusFailed')
    case 'booking_failed': return t('cardPayments.statusBookingFailed')
    case 'resolved': return t('cardPayments.statusResolved')
    default: return t('cardPayments.statusProcessing')
  }
}

function statusTone(row: CardPaymentRow) {
  if (row.is_stale || row.status === 'booking_failed') return 'danger' as const
  if (row.status === 'booked') return 'success' as const
  if (row.status === 'failed' || row.status === 'resolved') return 'baseMuted' as const
  return 'warning' as const
}

function canRecheck(row: CardPaymentRow) {
  return row.status === 'created' || row.status === 'processing' || row.status === 'failed'
}

function canResolve(row: CardPaymentRow) {
  return row.status === 'booking_failed' || row.is_stale
}

function hasActions(row: CardPaymentRow) {
  return canRecheck(row) || row.status === 'booking_failed' || canResolve(row)
}

const columns = computed<AdvancedTableColumn<CardPaymentRow>[]>(() => [
  {
    key: 'created_at',
    label: t('cardPayments.startedAt'),
    filterType: 'date',
    getValue: row => row.created_at,
    format: row => formatDateTime(row.created_at),
  },
  {
    key: 'event',
    label: t('orderChanges.event'),
    filterable: true,
    globalSearchable: true,
    getValue: row => row.event_name ?? '',
  },
  {
    key: 'stand',
    label: t('history.stand'),
    filterable: true,
    globalSearchable: true,
    getValue: row => row.stand_name ?? '',
  },
  {
    key: 'cashier',
    label: t('history.cashierLabel'),
    globalSearchable: true,
    getValue: row => row.cashier_name ?? '',
  },
  {
    key: 'amount',
    label: t('cardPayments.amount'),
    filterType: 'number',
    getValue: row => row.charged_amount ?? row.amount,
    format: row => formatCurrency(row.charged_amount ?? row.amount),
  },
  {
    key: 'transaction_code',
    label: t('card.transactionCode'),
    globalSearchable: true,
    getValue: row => row.transaction_code ?? '',
  },
  {
    key: 'status',
    label: t('cardPayments.status'),
    filterable: true,
    getValue: row => statusLabel(row),
  },
])

function openPayment(row: CardPaymentRow) {
  opened.value = row
  note.value = ''
  showModal.value = true
}

async function loadPayments() {
  if (!isOnline.value) {
    loading.value = false
    return
  }

  try {
    const res = await $fetch<any>('/api/card-payments', { query: problemsOnly.value ? { problems: '1' } : {} })
    if (res.ok) {
      payments.value = res.payments
      if (opened.value) opened.value = payments.value.find(row => row.client_uuid === opened.value!.client_uuid) ?? opened.value
    } else {
      toast.error(res.error || t('common.unknownError'))
    }
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function post(url: string, body: Record<string, unknown>) {
  busy.value = true
  try {
    const res = await $fetch<any>(url, { method: 'POST', body })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return null
    }
    return res
  } catch {
    toast.error(t('common.unknownError'))
    return null
  } finally {
    busy.value = false
  }
}

async function recheck(retryBooking: boolean) {
  if (!opened.value) return
  const res = await post('/api/card-payments/recheck', { client_uuid: opened.value.client_uuid, retry_booking: retryBooking })
  if (!res) return
  toast.info(t('cardPayments.rechecked', { status: statusLabel({ ...opened.value, status: res.payment.status, is_stale: res.payment.stale }) }))
  await loadPayments()
}

async function resolve() {
  if (!opened.value || !note.value.trim()) return
  const res = await post('/api/card-payments/resolve', { client_uuid: opened.value.client_uuid, note: note.value.trim() })
  if (!res) return
  toast.success(t('cardPayments.resolved'))
  showModal.value = false
  await loadPayments()
}

watch(problemsOnly, () => {
  loading.value = true
  loadPayments()
})

onMounted(loadPayments)
onRefresh(loadPayments)
onBeforeUnmount(onOnline(loadPayments))
</script>
