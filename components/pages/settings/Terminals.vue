<template>
  <div
    v-if="!configured"
    class="col-span-12 p-4 bg-warning-50 text-warning-900 shadow-lg rounded-xl border border-warning-200 text-sm"
  >
    {{ t('terminals.notConfigured') }}
  </div>

  <CommonPageTableCard
    v-else
    :title="t('terminals.title')"
    persist-key="settings-terminals"
    :search-value="search"
    can-create
    :create-label="`+ ${t('terminals.pair')}`"
    @update:search-value="search = $event"
    @create="openPairModal"
  >
    <template #actions>
      <button type="button" class="btn-secondary inline-flex items-center gap-1.5" :disabled="loading" @click="load">
        <Icon name="material-symbols:refresh-rounded" class="h-4 w-4" aria-hidden="true" />
        {{ t('terminals.refreshStatus') }}
      </button>
    </template>

    <CommonAdvancedTable
      v-model:search="search"
      :loading="loading"
      persist-key="settings-terminals"
      :rows="readers"
      :columns="columns"
      :empty-text="t('terminals.none')"
      show-actions
      :can-open-row="() => true"
      @row-open="openRenameModal($event)"
    >
      <template #cell-pairing_status="{ row }">
        <CommonStatusBadge :label="pairingLabel(row.pairing_status)" :tone="row.pairing_status === 'paired' ? 'success' : 'warning'" />
      </template>

      <template #cell-live="{ row }">
        <span v-if="row.live" class="inline-flex flex-wrap items-center gap-2">
          <CommonStatusBadge
            :label="row.live.status === 'ONLINE' ? t('terminals.online') : t('terminals.offline')"
            :tone="row.live.status === 'ONLINE' ? 'success' : 'danger'"
          />
          <span v-if="row.live.battery_level != null" class="text-xs text-base-500">
            {{ t('terminals.battery', { level: String(Math.round(row.live.battery_level)) }) }}
          </span>
          <span v-if="row.live.firmware_ok === false" class="text-xs text-warning-700">{{ t('terminals.firmwareOutdated') }}</span>
        </span>
        <span v-else-if="row.live_error" class="text-xs text-danger-600">{{ row.live_error }}</span>
        <span v-else class="text-xs text-base-400">–</span>
      </template>

      <template #cell-is_active="{ row }">
        <CommonStatusBadge
          :label="row.is_active ? t('common.active') : t('common.inactive')"
          :tone="row.is_active ? 'success' : 'baseMuted'"
        />
      </template>

      <template #actions="{ row }">
        <button class="text-link-600 hover:underline cursor-pointer" @click="openRenameModal(row)">
          {{ t('actions.edit') }}
        </button>
        <button
          class="hover:underline cursor-pointer"
          :class="row.is_active ? 'text-danger-500' : 'text-base-500'"
          :disabled="busy"
          @click="toggleActive(row)"
        >
          {{ row.is_active ? t('actions.deactivate') : t('actions.activate') }}
        </button>
        <button class="text-danger-600 hover:underline cursor-pointer" :disabled="busy" @click="readerToDelete = row">
          {{ t('actions.remove') }}
        </button>
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <CommonModal v-model="showPairModal" :title="t('terminals.pairTitle')" width-class="max-w-lg" @close="closePairModal">
    <ol class="list-decimal space-y-1 pl-5 text-sm text-base-700">
      <li>{{ t('terminals.pairStep1') }}</li>
      <li>{{ t('terminals.pairStep2') }}</li>
      <li>{{ t('terminals.pairStep3') }}</li>
      <li>{{ t('terminals.pairStep4') }}</li>
    </ol>

    <div class="field">
      <label for="terminal-name">{{ t('common.name') }}</label>
      <input id="terminal-name" v-model="pairForm.name" class="input" autocomplete="off" :disabled="busy" :placeholder="t('terminals.namePlaceholder')">
    </div>

    <div class="field">
      <label for="terminal-code">{{ t('terminals.pairingCode') }}</label>
      <input
        id="terminal-code"
        v-model="pairForm.code"
        class="input font-mono uppercase tracking-widest"
        autocomplete="off"
        autocapitalize="characters"
        maxlength="9"
        :disabled="busy"
      >
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('terminals.pair')"
        :save-disabled="!pairForm.name.trim() || !pairForm.code.trim()"
        :saving="busy"
        @cancel="closePairModal"
        @submit="pair"
      />
    </template>
  </CommonModal>

  <CommonModal v-model="showRenameModal" :title="t('terminals.renameTitle')" @close="closeRenameModal">
    <div class="field">
      <label for="terminal-rename">{{ t('common.name') }}</label>
      <input id="terminal-rename" v-model="renameValue" class="input" autocomplete="off" :disabled="busy">
    </div>
    <p v-if="renamedReader?.device_serial" class="text-sm text-base-600">
      {{ t('terminals.serialLabel', { serial: renamedReader.device_serial }) }}
    </p>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="!renameValue.trim()"
        :saving="busy"
        @cancel="closeRenameModal"
        @submit="rename"
      />
    </template>
  </CommonModal>

  <FormConfirmation
    v-if="readerToDelete"
    :headline="t('terminals.deleteTitle')"
    @confirm="confirmDelete"
    @cancel="readerToDelete = null"
  >
    <template #message>
      {{ t('terminals.deleteQuestion', { name: readerToDelete.name }) }}
      <span class="mt-2 block">{{ t('terminals.deleteDeviceHint') }}</span>
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'

interface ReaderRow {
  id: number
  name: string
  device_serial: string | null
  device_model: string | null
  pairing_status: string
  is_active: boolean
  paired_by_affiliation_name: string | null
  stands: Array<{ id: number, name: string }>
  live: null | {
    status: string
    state: string | null
    battery_level: number | null
    firmware_version: string | null
    firmware_ok: boolean | null
  }
  live_error?: string | null
}

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const busy = ref(false)
const configured = ref(true)
const search = ref('')
const readers = ref<ReaderRow[]>([])

function pairingLabel(status: string) {
  if (status === 'paired') return t('terminals.statusPaired')
  if (status === 'processing') return t('terminals.statusProcessing')
  if (status === 'expired') return t('terminals.statusExpired')
  return status
}

const columns: AdvancedTableColumn<ReaderRow>[] = [
  { key: 'name', label: t('common.name'), mobile: 'title', globalSearchable: true, getValue: row => row.name },
  {
    key: 'device',
    label: t('terminals.device'),
    globalSearchable: true,
    getValue: row => [row.device_model, row.device_serial].filter(Boolean).join(' · '),
  },
  {
    key: 'pairing_status',
    label: t('terminals.pairing'),
    filterable: true,
    getValue: row => pairingLabel(row.pairing_status),
  },
  {
    key: 'live',
    label: t('terminals.liveStatus'),
    sortable: false,
    filterable: false,
    getValue: row => row.live?.status ?? '',
  },
  {
    key: 'firmware',
    label: t('terminals.firmware'),
    getValue: row => row.live?.firmware_version ?? '',
  },
  {
    key: 'stands',
    label: t('terminals.stands'),
    globalSearchable: true,
    getValue: row => row.stands.map(stand => stand.name).join(', ') || '–',
  },
  {
    key: 'paired_by',
    label: t('terminals.pairedBy'),
    globalSearchable: true,
    getValue: row => row.paired_by_affiliation_name ?? t('terminals.pairedByAdmin'),
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: row => row.is_active ? t('common.active') : t('common.inactive'),
  },
]

async function load() {
  loading.value = true
  try {
    const res = await $fetch<any>('/api/card-readers', { query: { status: '1' } })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    configured.value = res.configured !== false
    readers.value = res.readers
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    loading.value = false
  }
}

async function post(url: string, body: Record<string, unknown>) {
  busy.value = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>(url, { method: 'POST', body })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return false
    }
    await load()
    return true
  } catch {
    toast.error(t('common.unknownError'))
    return false
  } finally {
    busy.value = false
  }
}

const showPairModal = ref(false)
const pairForm = ref({ name: '', code: '' })

function openPairModal() {
  pairForm.value = { name: '', code: '' }
  showPairModal.value = true
}

function closePairModal() {
  if (busy.value) return
  showPairModal.value = false
}

async function pair() {
  const done = await post('/api/card-readers/pair', { name: pairForm.value.name.trim(), pairing_code: pairForm.value.code.trim() })
  if (done) {
    showPairModal.value = false
    toast.success(t('terminals.paired'))
  }
}

const showRenameModal = ref(false)
const renamedReader = ref<ReaderRow | null>(null)
const renameValue = ref('')

function openRenameModal(reader: ReaderRow) {
  renamedReader.value = reader
  renameValue.value = reader.name
  showRenameModal.value = true
}

function closeRenameModal() {
  if (busy.value) return
  showRenameModal.value = false
  renamedReader.value = null
}

async function rename() {
  if (!renamedReader.value) return
  const done = await post('/api/card-readers/update', { id: renamedReader.value.id, name: renameValue.value.trim() })
  if (done) {
    showRenameModal.value = false
    renamedReader.value = null
  }
}

function toggleActive(reader: ReaderRow) {
  return post('/api/card-readers/update', { id: reader.id, is_active: !reader.is_active })
}

const readerToDelete = ref<ReaderRow | null>(null)

async function confirmDelete() {
  const reader = readerToDelete.value
  readerToDelete.value = null
  if (!reader) return
  if (await post('/api/card-readers/delete', { id: reader.id })) toast.success(t('terminals.deleted'))
}

onMounted(load)
useAppRefresh().onRefresh(load)
</script>
