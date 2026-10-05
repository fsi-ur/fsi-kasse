<template>
  <Page :headline1="t('orderChanges.title')" @open-menu="$emit('openMenu')">
    <template #cards>
      <CommonOfflineNotice v-if="!isOnline" variant="unavailable" />

      <CommonPageTableCard
        v-else
        :title="t('orderChanges.title')"
        persist-key="order-changes"
        :search-value="search"
        @update:search-value="search = $event"
      >
        <CommonAdvancedTable
          v-model:search="search"
          persist-key="order-changes"
          :rows="requests"
          :loading="loading"
          :columns="columns"
          :empty-text="t('orderChanges.noRequests')"
          :show-actions="false"
          @row-open="openRequest"
        >
          <template #cell-status="{ row }">
            <CommonStatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" />
          </template>

          <template #mobile-title="{ row }">
            {{ t('orderChanges.orderLabel', { id: row.order_id }) }} — {{ t('orderChanges.difference') }}:
            {{ formatDifference(row) }}
          </template>

          <template #mobile-meta="{ row }">
            <span class="truncate">
              {{ requesterLabel(row) }} — {{ formatDateTime(row.created_at) }}
            </span>
            <CommonStatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" />
          </template>
        </CommonAdvancedTable>
      </CommonPageTableCard>
    </template>
  </Page>

  <CommonModal
    v-model="showModal"
    :title="opened ? t('orderChanges.requestEntry', { id: opened.id }) : ''"
    width-class="max-w-xl"
  >
    <template v-if="opened">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-3 border-b border-base-200">
        <dt class="text-base-500">{{ t('orderChanges.order') }}</dt>
        <dd class="text-right">#{{ opened.order_id }}</dd>
        <dt class="text-base-500">{{ t('orderChanges.event') }}</dt>
        <dd class="text-right">{{ opened.event_name ?? `#${opened.event_id}` }}</dd>
        <dt class="text-base-500">{{ t('orderChanges.requestedBy') }}</dt>
        <dd class="text-right">{{ requesterLabel(opened) }}</dd>
        <dt class="text-base-500">{{ t('orderChanges.requestedAt') }}</dt>
        <dd class="text-right">{{ formatDateTime(opened.created_at) }}</dd>
        <dt class="text-base-500">{{ t('orderChanges.status') }}</dt>
        <dd class="text-right">
          <CommonStatusBadge :label="statusLabel(opened.status)" :tone="statusTone(opened.status)" />
        </dd>
        <template v-if="opened.status !== 'pending'">
          <dt class="text-base-500">{{ t('orderChanges.reviewedBy') }}</dt>
          <dd class="text-right">{{ opened.reviewed_by ?? t('common.notAvailable') }}</dd>
          <dt class="text-base-500">{{ t('orderChanges.reviewedAt') }}</dt>
          <dd class="text-right">{{ opened.reviewed_at ? formatDateTime(opened.reviewed_at) : t('common.notAvailable') }}</dd>
        </template>
      </dl>

      <div v-if="opened.reason">
        <p class="section-title">{{ t('orderChanges.reason') }}</p>
        <p class="text-sm whitespace-pre-line">{{ opened.reason }}</p>
      </div>

      <PagesOrderChangesDiff :request="opened" />

      <div v-if="opened.status === 'pending'">
        <label for="order-change-note" class="section-title block">{{ t('orderChanges.reviewNote') }}</label>
        <textarea
          id="order-change-note"
          v-model="note"
          class="input"
          rows="2"
          maxlength="1000"
          :placeholder="t('orderChanges.reviewNotePlaceholder')"
        />
      </div>
      <div v-else-if="opened.review_note">
        <p class="section-title">{{ t('orderChanges.reviewNote') }}</p>
        <p class="text-sm whitespace-pre-line">{{ opened.review_note }}</p>
      </div>
    </template>

    <template #footer>
      <template v-if="opened?.status === 'pending'">
        <button class="btn-secondary mr-auto" :disabled="reviewing" @click="showModal = false">
          {{ t('actions.close') }}
        </button>
        <button
          class="rounded-lg py-2 px-4 text-sm text-white bg-danger-600 hover:bg-danger-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="reviewing"
          @click="review('reject')"
        >
          {{ t('orderChanges.reject') }}
        </button>
        <button class="btn-primary" :disabled="reviewing" @click="review('approve')">
          {{ t('orderChanges.approve') }}
        </button>
      </template>
      <button v-else class="btn-secondary" @click="showModal = false">
        {{ t('actions.close') }}
      </button>
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
import type { OrderChangeRequest, OrderChangeStatus } from '~/server/utils/orderChanges'

const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const { onRefresh } = useAppRefresh()
const toast = useToast()
const { isOnline, onOnline } = useConnectivity()

defineEmits<{
  (e: 'openMenu'): void
}>()

const requests = ref<OrderChangeRequest[]>([])
const loading = ref(true)
const search = ref('')
const showModal = ref(false)
const opened = ref<OrderChangeRequest | null>(null)
const note = ref('')
const reviewing = ref(false)

function statusLabel(status: OrderChangeStatus) {
  if (status === 'approved') return t('orderChanges.statusApproved')
  if (status === 'rejected') return t('orderChanges.statusRejected')
  return t('orderChanges.statusPending')
}

function statusTone(status: OrderChangeStatus) {
  if (status === 'approved') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  return 'warning' as const
}

function requesterLabel(request: OrderChangeRequest) {
  if (request.cashier && request.requested_by) return `${request.cashier} (${request.requested_by})`
  return request.cashier ?? request.requested_by ?? t('common.notAvailable')
}

function difference(request: OrderChangeRequest) {
  return Math.round((request.proposed.total - request.original.total) * 100) / 100
}

function formatDifference(request: OrderChangeRequest) {
  const value = difference(request)
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`
}

const columns = computed<AdvancedTableColumn<OrderChangeRequest>[]>(() => [
  {
    key: 'order_id',
    label: t('orderChanges.order'),
    filterType: 'number',
    getValue: request => request.order_id,
    format: request => `#${request.order_id}`,
  },
  {
    key: 'event',
    label: t('orderChanges.event'),
    filterable: true,
    globalSearchable: true,
    getValue: request => request.event_name ?? '',
  },
  {
    key: 'requested_by',
    label: t('orderChanges.requestedBy'),
    globalSearchable: true,
    getValue: request => requesterLabel(request),
  },
  {
    key: 'created_at',
    label: t('orderChanges.requestedAt'),
    filterType: 'date',
    getValue: request => request.created_at,
    format: request => formatDateTime(request.created_at),
  },
  {
    key: 'reason',
    label: t('orderChanges.reason'),
    globalSearchable: true,
    getValue: request => request.reason ?? '',
    cellClass: 'max-w-xs truncate',
  },
  {
    key: 'difference',
    label: t('orderChanges.difference'),
    filterType: 'number',
    getValue: request => difference(request),
    format: request => formatDifference(request),
  },
  {
    key: 'status',
    label: t('orderChanges.status'),
    filterable: true,
    getValue: request => statusLabel(request.status),
  },
])

function openRequest(request: OrderChangeRequest) {
  opened.value = request
  note.value = ''
  showModal.value = true
}

async function loadRequests() {
  if (!isOnline.value) {
    loading.value = false
    return
  }

  try {
    const res = await $fetch<any>('/api/order-changes')
    if (res.ok) requests.value = res.requests
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function review(decision: 'approve' | 'reject') {
  if (!opened.value) return

  reviewing.value = true
  try {
    const res = await $fetch<any>('/api/order-changes/review', {
      method: 'POST',
      body: { id: opened.value.id, decision, note: note.value.trim() || null },
    })

    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }

    toast.success(decision === 'approve' ? t('orderChanges.approved') : t('orderChanges.rejected'))
    showModal.value = false
    await loadRequests()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    reviewing.value = false
  }
}

onMounted(loadRequests)
onRefresh(loadRequests)
onBeforeUnmount(onOnline(loadRequests))
</script>
