<template>
  <CommonPageTableCard
    :title="t('vouchers.list.title')"
    persist-key="vouchers-list"
    :search-value="search"
    :search-placeholder="t('vouchers.list.searchPlaceholder')"
    @update:search-value="search = $event"
  >
    <template #actions>
      <CommonSelectMenu v-model="batchFilter" :options="batchOptions" wrapper-class="relative w-56 max-w-full" />
      <CommonSelectMenu v-model="statusFilter" :options="statusOptions" wrapper-class="relative w-44 max-w-full" />
    </template>

    <CommonAdvancedTable
      v-model:search="search"
      persist-key="vouchers-list"
      :rows="vouchers"
      :loading="loading"
      :columns="columns"
      :empty-text="t('vouchers.list.none')"
      :show-actions="false"
      @row-open="openVoucher"
    >
      <template #cell-code="{ row }">
        <span class="font-mono">{{ row.code_formatted }}</span>
      </template>
      <template #cell-status="{ row }">
        <CommonStatusBadge :label="statusLabel(row.display_status)" :tone="statusTone(row.display_status)" />
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <VoucherScanModal
    v-model="showDetail"
    :initial-code="openedCode"
    context="check"
    @changed="loadVouchers"
  />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useVoucherLabels, type VoucherDisplayStatus } from '~/composables/useVoucherLabels'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

const STATUSES: VoucherDisplayStatus[] = ['unsold', 'active', 'used_up', 'revoked']

const { t } = useI18n()
const toast = useToast()
const { formatDateTime } = useLocaleFormatters()
const { statusLabel, statusTone, kindLabel } = useVoucherLabels()

const vouchers = ref<any[]>([])
const batches = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const batchFilter = ref('')
const statusFilter = ref('')
const showDetail = ref(false)
const openedCode = ref<string | null>(null)

const batchOptions = computed(() => [
  { value: '', label: t('vouchers.list.allBatches') },
  ...batches.value.map(batch => ({ value: String(batch.id), label: batch.name as string })),
])
const statusOptions = computed(() => [
  { value: '', label: t('vouchers.list.allStatuses') },
  ...STATUSES.map(status => ({ value: status as string, label: statusLabel(status) })),
])

const columns: AdvancedTableColumn<any>[] = [
  {
    key: 'code',
    label: t('vouchers.list.code'),
    filterable: false,
    globalSearchable: true,
    mobile: 'title',
    // Both spellings, so a search with or without dashes matches.
    getValue: row => `${row.code_formatted} ${row.code}`,
    format: row => row.code_formatted,
  },
  { key: 'batch', label: t('vouchers.list.batch'), globalSearchable: true, getValue: row => row.batch_name },
  { key: 'kind', label: t('vouchers.form.kind'), mobile: 'hidden', getValue: row => kindLabel(row.kind) },
  { key: 'status', label: t('vouchers.list.status'), getValue: row => statusLabel(row.display_status) },
  {
    key: 'units',
    label: t('vouchers.list.units'),
    filterType: 'number',
    mobileLabel: true,
    getValue: row => row.units_remaining,
    format: row => `${row.units_remaining} / ${row.units_total}`,
  },
  {
    key: 'sold_at',
    label: t('vouchers.list.soldAt'),
    filterType: 'date',
    mobile: 'hidden',
    getValue: row => row.sold_at ?? '',
    format: row => row.sold_at ? formatDateTime(row.sold_at) : '–',
  },
]

async function loadVouchers() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (batchFilter.value) params.set('batch_id', batchFilter.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    const res = await $fetch<any>(`/api/vouchers?${params}`)
    if (res.ok) vouchers.value = res.vouchers
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function loadBatches() {
  try {
    const res = await $fetch<any>('/api/vouchers/batches')
    if (res.ok) batches.value = res.batches
  } catch {
    batches.value = []
  }
}

function openVoucher(row: any) {
  openedCode.value = row.code
  showDetail.value = true
}

watch([batchFilter, statusFilter], loadVouchers)

onMounted(() => {
  loadBatches()
  loadVouchers()
})
useAppRefresh().onRefresh(async () => {
  await Promise.all([loadBatches(), loadVouchers()])
})
</script>
