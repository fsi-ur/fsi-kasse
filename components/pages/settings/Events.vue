<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('events.allEvents')"
    :singular-label="t('events.eventName')"
    :add-label="t('events.newEvent')"
    :empty-label="t('events.none')"
    persist-key="settings-events"
    list-endpoint="/api/events"
    save-endpoint="/api/events/create"
    activate-endpoint="/api/events/activate"
    delete-endpoint="/api/events/delete"
    :delete-confirm-title="t('events.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('events.deleteConfirmQuestion', { name: item.name })"
    response-list-key="events"
    :extra-columns="columns"
    :editable="false"
    :read-only="readOnly"
    :read-only-notice="`${t('events.connectedNotice')} ${t('events.fachschaftNotice')}`"
    :create-item="() => ({ name: '', starts_at: '', ends_at: '' })"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'success' : 'baseMuted'"
      />
    </template>

    <template #extra-actions="{ item }">
      <button
        type="button"
        class="hover:underline cursor-pointer text-link-600"
        @click="openAccessModal(item)"
      >
        {{ t('events.access.edit') }}
      </button>
      <button
        type="button"
        class="hover:underline cursor-pointer text-info-600"
        @click="toggleFachschaft(item)"
      >
        {{ fachschaftOn(item) ? t('events.fachschaftDisable') : t('events.fachschaftEnable') }}
      </button>
    </template>

    <template #modal-fields="{ editingItem: entity }">
      <div class="flex gap-4">
        <div class="field flex-1">
          <label>{{ t('events.startsAt') }}</label>
          <CommonDateInput
            :model-value="toDateInputValue(entity.starts_at)"
            mode="datetime"
            @update:model-value="entity.starts_at = $event"
          />
        </div>
        <div class="field flex-1">
          <label>{{ t('events.endsAt') }}</label>
          <CommonDateInput
            :model-value="toDateInputValue(entity.ends_at)"
            mode="datetime"
            @update:model-value="entity.ends_at = $event"
          />
        </div>
      </div>
    </template>
  </PagesSettingsEntityManager>

  <CommonModal
    v-model="showAccessModal"
    :title="t('events.access.title', { name: accessEvent?.name ?? '' })"
    width-class="max-w-xl"
    @close="closeAccessModal"
  >
    <p class="text-sm text-base-600">{{ t('events.access.help') }}</p>

    <div class="flex flex-col gap-3">
      <div
        v-for="(row, index) in accessRows"
        :key="index"
        class="flex flex-col gap-2 rounded-lg border border-base-200 p-3"
      >
        <div class="flex items-center gap-2">
          <CommonSelectMenu
            v-model="row.affiliation_id"
            :options="affiliationOptions(row)"
            :placeholder="t('events.access.affiliation')"
            wrapper-class="relative min-w-0 flex-1"
            :disabled="savingAccess"
          />
          <button
            type="button"
            class="text-danger-600 hover:underline cursor-pointer text-sm"
            :disabled="savingAccess"
            @click="accessRows.splice(index, 1)"
          >
            {{ t('events.access.remove') }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="standId in row.stand_ids"
            :key="standId"
            class="inline-flex items-center gap-1 rounded-full bg-base-100 px-2.5 py-1 text-sm text-base-800"
          >
            {{ standName(standId) }}
            <button
              type="button"
              class="cursor-pointer text-base-500 hover:text-danger-600"
              :aria-label="t('events.access.removeStand', { name: standName(standId) })"
              :disabled="savingAccess"
              @click="row.stand_ids = row.stand_ids.filter(id => id !== standId)"
            >
              <Icon name="material-symbols:close-rounded" class="size-4" />
            </button>
          </span>

          <div v-if="standOptions(row).length > 0" class="w-48 max-w-full">
            <CommonSearchSelect
              v-model="row.standQuery"
              :options="standOptions(row)"
              :placeholder="t('events.access.addStand')"
              :empty-text="t('select.noStands')"
              :disabled="savingAccess"
              @select="addStand(row, $event)"
            />
          </div>
          <span v-else-if="row.stand_ids.length === 0" class="text-sm text-base-400">{{ t('events.access.noStand') }}</span>
        </div>
      </div>

      <p v-if="accessRows.length === 0" class="text-sm text-base-400">{{ t('events.access.none') }}</p>

      <button
        v-if="accessRows.length < affiliations.length"
        type="button"
        class="self-start text-link-600 hover:underline cursor-pointer text-sm"
        :disabled="savingAccess"
        @click="accessRows.push({ affiliation_id: null, stand_ids: [], standQuery: '' })"
      >
        + {{ t('events.access.add') }}
      </button>
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="accessRows.some(row => row.affiliation_id == null)"
        :saving="savingAccess"
        @cancel="closeAccessModal"
        @submit="saveAccess"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { EntityManagerColumn } from './EntityManager.vue'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

const { t } = useI18n()
const toast = useToast()
const { formatLocalDateTime } = useLocaleFormatters()

const managerRef = ref<{ loadItems: () => Promise<void> } | null>(null)
const readOnly = ref(false)

const columns: EntityManagerColumn[] = [
  {
    key: 'starts_at',
    label: t('events.startsAt'),
    filterType: 'date',
    getValue: item => (item as any).starts_at,
    format: item => formatLocalDateTime((item as any).starts_at),
  },
  {
    key: 'ends_at',
    label: t('events.endsAt'),
    filterType: 'date',
    getValue: item => (item as any).ends_at,
    format: item => formatLocalDateTime((item as any).ends_at),
  },
  {
    key: 'fachschaft_enabled',
    label: t('events.fachschaftColumn'),
    filterable: false,
    sortable: false,
    getValue: item => fachschaftOn(item) ? t('events.fachschaftAllowed') : t('events.fachschaftBlocked'),
    format: item => fachschaftOn(item) ? t('events.fachschaftAllowed') : t('events.fachschaftBlocked'),
  },
  {
    key: 'affiliations',
    label: t('events.access.column'),
    getValue: item => accessSummary(item),
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

function toDateInputValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function fachschaftOn(item: unknown) {
  return Boolean((item as { fachschaft_enabled?: unknown }).fachschaft_enabled)
}

async function toggleFachschaft(item: { id: number }) {
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>('/api/events/fachschaft', {
      method: 'POST',
      body: { id: item.id, fachschaft_enabled: fachschaftOn(item) ? 0 : 1 },
    })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    await managerRef.value?.loadItems()
  } catch {
    toast.error(t('common.unknownError'))
  }
}

interface EventAffiliationEntry {
  affiliation_id: number
  affiliation_name: string
  stands: Array<{ id: number, name: string }>
}

interface AccessRow {
  affiliation_id: number | null
  stand_ids: number[]
  /** Search text of the row's stand picker; not sent to the server. */
  standQuery: string
}

function eventAffiliations(item: unknown): EventAffiliationEntry[] {
  return (item as { affiliations?: EventAffiliationEntry[] }).affiliations ?? []
}

function accessSummary(item: unknown) {
  const entries = eventAffiliations(item)
  if (entries.length === 0) return t('events.access.noGuests')
  return entries
    .map(entry => entry.stands.length
      ? `${entry.affiliation_name} (${entry.stands.map(stand => stand.name).join(', ')})`
      : entry.affiliation_name)
    .join(', ')
}

const showAccessModal = ref(false)
const savingAccess = ref(false)
const accessEvent = ref<{ id: number, name: string } | null>(null)
const accessRows = ref<AccessRow[]>([])
const affiliations = ref<Array<{ id: number, name: string }>>([])
const stands = ref<Array<{ id: number, name: string }>>([])

function standName(id: number) {
  return stands.value.find(stand => stand.id === id)?.name ?? `#${id}`
}

// An affiliation can run several stands, and a stand can be shared with other rows.
function standOptions(row: AccessRow): SearchSelectOption[] {
  return stands.value
    .filter(stand => !row.stand_ids.includes(stand.id))
    .map(stand => ({ key: stand.id, label: stand.name, value: stand.id }))
}

function addStand(row: AccessRow, value: unknown) {
  row.standQuery = ''
  const id = Number(value)
  if (!row.stand_ids.includes(id)) row.stand_ids = [...row.stand_ids, id]
}

// Each affiliation can only appear once per event.
function affiliationOptions(row: AccessRow) {
  const taken = new Set(accessRows.value.filter(other => other !== row).map(other => other.affiliation_id))
  return affiliations.value
    .filter(affiliation => !taken.has(affiliation.id))
    .map(affiliation => ({ value: affiliation.id as number | null, label: affiliation.name }))
}

async function loadAccessOptions() {
  const [affiliationRes, standRes] = await Promise.all([
    $fetch<any>('/api/affiliations'),
    $fetch<any>('/api/stands'),
  ])
  if (!affiliationRes.ok || !standRes.ok) throw new Error(affiliationRes.error || standRes.error)

  // Inactive entries stay selectable when the event already uses them.
  const used = accessRows.value
  affiliations.value = (affiliationRes.affiliations as any[])
    .filter(entry => entry.is_active || used.some(row => row.affiliation_id === entry.id))
    .map(entry => ({ id: Number(entry.id), name: String(entry.name) }))
  stands.value = (standRes.stands as any[])
    .filter(entry => entry.is_active || used.some(row => row.stand_ids.includes(entry.id)))
    .map(entry => ({ id: Number(entry.id), name: String(entry.name) }))
}

async function openAccessModal(item: { id: number, name: string }) {
  accessEvent.value = { id: item.id, name: item.name }
  accessRows.value = eventAffiliations(item).map(entry => ({
    affiliation_id: entry.affiliation_id,
    stand_ids: entry.stands.map(stand => stand.id),
    standQuery: '',
  }))
  try {
    await loadAccessOptions()
    showAccessModal.value = true
  } catch (error) {
    toast.error((error as Error)?.message || t('common.unknownError'))
  }
}

function closeAccessModal() {
  if (savingAccess.value) return
  showAccessModal.value = false
  accessEvent.value = null
}

async function saveAccess() {
  if (!accessEvent.value) return
  savingAccess.value = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>('/api/events/affiliations', {
      method: 'POST',
      body: {
        id: accessEvent.value.id,
        affiliations: accessRows.value.map(row => ({ affiliation_id: row.affiliation_id, stand_ids: row.stand_ids })),
      },
    })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    showAccessModal.value = false
    accessEvent.value = null
    await managerRef.value?.loadItems()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    savingAccess.value = false
  }
}

function handleError(context: { message?: string }) {
  toast.error(context.message || t('common.unknownError'))
}

useAppRefresh().onRefresh(async () => {
  await managerRef.value?.loadItems()
})

onMounted(async () => {
  const res = await $fetch('/api/events', { method: 'GET' })
  if (res.ok && 'read_only' in res) readOnly.value = Boolean(res.read_only)
})
</script>
