<template>
  <CommonPageTableCard
    :title="t('vouchers.batches.title')"
    persist-key="vouchers-batches"
    :search-value="search"
    can-create
    :create-label="`+ ${t('vouchers.batches.new')}`"
    @update:search-value="search = $event"
    @create="openForm(null)"
  >
    <CommonAdvancedTable
      v-model:search="search"
      persist-key="vouchers-batches"
      :rows="batches"
      :loading="loading"
      :columns="columns"
      :empty-text="t('vouchers.batches.none')"
      @row-open="openForm($event)"
    >
      <template #cell-kind="{ row }">
        <CommonStatusBadge :label="kindLabel(row.kind)" :tone="row.kind === 'paid' ? 'warning' : 'success'" />
      </template>

      <template #cell-counts="{ row }">
        <span class="whitespace-nowrap text-xs">
          <template v-if="row.kind === 'paid'">{{ t('vouchers.batches.countUnsold', { count: row.unsold }) }} · </template>
          {{ t('vouchers.batches.countActive', { count: row.active }) }} ·
          {{ t('vouchers.batches.countUsedUp', { count: row.used_up }) }}<template v-if="row.revoked"> ·
            <span class="text-danger-600">{{ t('vouchers.batches.countRevoked', { count: row.revoked }) }}</span></template>
        </span>
      </template>

      <template #actions="{ row }">
        <button class="text-link-600 hover:underline cursor-pointer" @click="openForm(row)">
          {{ t('actions.edit') }}
        </button>
        <button class="text-link-600 hover:underline cursor-pointer" @click="openAddCodes(row)">
          {{ t('vouchers.batches.addCodes') }}
        </button>
        <button class="text-link-600 hover:underline cursor-pointer" @click="downloadCsv(row)">
          {{ t('vouchers.export.csv') }}
        </button>
        <button class="text-link-600 hover:underline cursor-pointer" @click="zipBatch = row">
          {{ t('vouchers.export.zip') }}
        </button>
        <button class="text-link-600 hover:underline cursor-pointer" @click="pdfBatch = row">
          {{ t('vouchers.pdf.open') }}
        </button>
        <button
          v-if="row.unsold + row.active + row.used_up > 0"
          class="text-danger-600 hover:underline cursor-pointer"
          @click="revokeBatch = row"
        >
          {{ t('vouchers.batches.revoke') }}
        </button>
        <button v-if="!row.in_use" class="text-danger-600 hover:underline cursor-pointer" @click="deleteTarget = row">
          {{ t('actions.remove') }}
        </button>
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <PagesVouchersBatchForm v-model="showForm" :batch="editedBatch" @saved="onSaved" />

  <PagesVouchersZipExport :model-value="!!zipBatch" :batch="zipBatch" @update:model-value="zipBatch = $event ? zipBatch : null" />

  <PagesVouchersBatchRevoke
    :model-value="!!revokeBatch"
    :batch="revokeBatch"
    @update:model-value="revokeBatch = $event ? revokeBatch : null"
    @revoked="loadBatches"
  />

  <VoucherPdfStamper
    v-if="pdfBatch"
    :model-value="!!pdfBatch"
    :batch="pdfBatch"
    :batches="batches"
    @update:model-value="pdfBatch = $event ? pdfBatch : null"
    @layout-saved="loadBatches"
  />

  <CommonModal v-model="showAddCodes" :title="addCodesBatch ? t('vouchers.batches.addCodesTitle', { name: addCodesBatch.name }) : ''">
    <div class="field">
      <label>{{ t('vouchers.form.count') }}</label>
      <input v-model.number="addCount" type="number" min="1" :max="2000" step="1" class="input" />
    </div>
    <p class="text-xs text-base-500">{{ t('vouchers.batches.addCodesHint', { count: addCodesBatch?.total ?? 0 }) }}</p>
    <template #footer>
      <CommonFormActions
        class="w-full"
        :saving="addingCodes"
        :save-disabled="!(addCount > 0)"
        :cancel-label="t('actions.cancel')"
        :submit-label="t('vouchers.batches.addCodes')"
        @cancel="showAddCodes = false"
        @submit="addCodes"
      />
    </template>
  </CommonModal>

  <CommonModal v-model="showCreated" :title="t('vouchers.batches.createdTitle')">
    <p class="text-sm text-base-700">{{ t('vouchers.batches.createdText', { name: createdBatch?.name ?? '', count: createdBatch?.total ?? 0 }) }}</p>
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button type="button" class="btn-outline" @click="createdBatch && downloadCsv(createdBatch)">{{ t('vouchers.export.csv') }}</button>
      <button type="button" class="btn-outline" @click="zipBatch = createdBatch; showCreated = false">{{ t('vouchers.export.zip') }}</button>
      <button type="button" class="btn-outline" @click="pdfBatch = createdBatch; showCreated = false">{{ t('vouchers.pdf.open') }}</button>
    </div>
    <template #footer>
      <button type="button" class="btn-secondary" @click="showCreated = false">{{ t('actions.close') }}</button>
    </template>
  </CommonModal>

  <FormConfirmation
    v-if="deleteTarget"
    :headline="t('vouchers.batches.deleteTitle')"
    @confirm="confirmDelete"
    @cancel="deleteTarget = null"
  >
    <template #message>
      {{ t('vouchers.batches.deleteQuestion', { name: deleteTarget.name, count: deleteTarget.total }) }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useVoucherLabels } from '~/composables/useVoucherLabels'
import { downloadFromApi } from '~/composables/useFileDownload'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

const { t } = useI18n()
const toast = useToast()
const { formatCurrency, formatLocalDate } = useLocaleFormatters()
const { kindLabel } = useVoucherLabels()

const batches = ref<any[]>([])
const loading = ref(true)
const search = ref('')

const showForm = ref(false)
const editedBatch = ref<any | null>(null)
const zipBatch = ref<any | null>(null)
const pdfBatch = ref<any | null>(null)
const deleteTarget = ref<any | null>(null)
const revokeBatch = ref<any | null>(null)

const showAddCodes = ref(false)
const addCodesBatch = ref<any | null>(null)
const addCount = ref(10)
const addingCodes = ref(false)

const showCreated = ref(false)
const createdBatch = ref<any | null>(null)

const columns: AdvancedTableColumn<any>[] = [
  { key: 'name', label: t('common.name'), globalSearchable: true, filterable: false, mobile: 'title', getValue: row => row.name },
  { key: 'kind', label: t('vouchers.form.kind'), getValue: row => kindLabel(row.kind) },
  { key: 'item_group', label: t('vouchers.form.itemGroup'), globalSearchable: true, getValue: row => row.item_group_name },
  { key: 'units', label: t('vouchers.batches.units'), filterType: 'number', mobileLabel: true, getValue: row => row.units_per_voucher },
  {
    key: 'price',
    label: t('common.price'),
    filterType: 'number',
    getValue: row => row.sale_price ?? 0,
    format: row => row.sale_price == null ? t('vouchers.kind.free') : formatCurrency(row.sale_price),
  },
  {
    key: 'deposit',
    label: t('common.deposit'),
    mobile: 'hidden',
    getValue: row => row.includes_deposit ? t('vouchers.batches.depositIncluded') : t('vouchers.batches.depositExtra'),
  },
  {
    key: 'event',
    label: t('vouchers.form.event'),
    globalSearchable: true,
    getValue: row => row.event_name ?? t('vouchers.form.anyEvent'),
  },
  {
    key: 'valid_until',
    label: t('vouchers.form.validUntil'),
    filterType: 'date',
    mobile: 'hidden',
    getValue: row => row.valid_until ?? '',
    format: row => row.valid_until ? formatLocalDate(row.valid_until) : t('vouchers.form.noExpiry'),
  },
  { key: 'counts', label: t('vouchers.batches.counts'), sortable: false, filterable: false, getValue: row => row.total },
  {
    key: 'units_remaining',
    label: t('vouchers.batches.unitsRemaining'),
    filterType: 'number',
    mobile: 'hidden',
    getValue: row => row.units_remaining,
  },
]

function openForm(batch: any | null) {
  editedBatch.value = batch
  showForm.value = true
}

function openAddCodes(batch: any) {
  addCodesBatch.value = batch
  addCount.value = 10
  showAddCodes.value = true
}

async function loadBatches() {
  try {
    const res = await $fetch<any>('/api/vouchers/batches')
    if (res.ok) batches.value = res.batches
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function onSaved(payload: { id: number, created: boolean }) {
  await loadBatches()
  if (!payload.created) return
  createdBatch.value = batches.value.find(batch => batch.id === payload.id) ?? null
  showCreated.value = Boolean(createdBatch.value)
}

async function downloadCsv(batch: any) {
  const result = await downloadFromApi(`/api/vouchers/batches/${batch.id}/export.csv`, 'gutscheine.csv')
  if (!result.ok) toast.error(result.error || t('vouchers.export.failed'))
}

async function addCodes() {
  if (!addCodesBatch.value || addingCodes.value) return
  addingCodes.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/batches/add-codes', {
      method: 'POST',
      body: { batch_id: addCodesBatch.value.id, count: addCount.value },
    })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    toast.success(t('vouchers.batches.codesAdded', { count: addCount.value }))
    showAddCodes.value = false
    await loadBatches()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    addingCodes.value = false
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return

  try {
    const res = await $fetch<any>('/api/vouchers/batches/delete', { method: 'POST', body: { id: target.id } })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    toast.success(t('common.deleted'))
    await loadBatches()
  } catch {
    toast.error(t('common.unknownError'))
  }
}

onMounted(loadBatches)
useAppRefresh().onRefresh(loadBatches)
</script>
