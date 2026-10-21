<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('stands.all')"
    :singular-label="t('stands.singular')"
    :add-label="t('stands.new')"
    :empty-label="t('stands.none')"
    persist-key="settings-stands"
    list-endpoint="/api/stands"
    save-endpoint="/api/stands/create"
    update-endpoint="/api/stands/update"
    activate-endpoint="/api/stands/activate"
    delete-endpoint="/api/stands/delete"
    :delete-confirm-title="t('stands.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('stands.deleteConfirmQuestion', { name: item.name })"
    response-list-key="stands"
    :extra-columns="columns"
    :create-item="createItem"
    :map-edit-item="mapEditItem"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'success' : 'baseMuted'"
      />
    </template>

    <template #cell-card="{ item }">
      <CommonStatusBadge :label="cardSummary(item)" :tone="cardTone(item)" />
    </template>

    <template v-if="cardConfigured" #extra-actions="{ item }">
      <button type="button" class="hover:underline cursor-pointer text-info-600" @click="openCardModal(item)">
        {{ t('card.stand.edit') }}
      </button>
    </template>

    <template #modal-fields="{ editingItem: entity }">
      <div class="field">
        <div class="flex flex-wrap items-center gap-2">
          <label>{{ t('stands.items') }}</label>
          <span class="text-xs text-base-500">
            {{ t('stands.selectedCount', { count: selectedIds(entity).length }) }}
          </span>
          <div class="ml-auto flex gap-3 text-sm">
            <button type="button" class="text-link-600 hover:underline cursor-pointer" @click="selectFiltered(entity, true)">
              {{ t('stands.selectAll') }}
            </button>
            <button type="button" class="text-link-600 hover:underline cursor-pointer" @click="selectFiltered(entity, false)">
              {{ t('stands.selectNone') }}
            </button>
          </div>
        </div>

        <input v-model="itemFilter" class="input" :placeholder="t('stands.filterItems')" />

        <div class="max-h-64 overflow-y-auto rounded-lg border border-base-200 py-1">
          <label
            v-for="item in filteredItems"
            :key="item.id"
            class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm transition hover:bg-base-50"
          >
            <input
              type="checkbox"
              class="checkbox shrink-0"
              :checked="selectedIds(entity).includes(item.id)"
              @change="toggleItem(entity, item.id)"
            >
            <span class="min-w-0 flex-1 truncate" :class="item.is_active ? 'text-base-800' : 'text-base-400'">
              {{ item.name }}
            </span>
            <CommonStatusBadge v-if="!item.is_active" :label="t('common.inactive')" tone="baseMuted" />
          </label>

          <p v-if="filteredItems.length === 0" class="px-2.5 py-3 text-center text-sm text-base-400">
            {{ allItems.length === 0 ? t('items.none') : t('stands.noItemsMatch') }}
          </p>
        </div>
      </div>
    </template>
  </PagesSettingsEntityManager>

  <CommonModal
    v-model="showCardModal"
    :title="t('card.stand.title', { name: cardStand?.name ?? '' })"
    @close="closeCardModal"
  >
    <label class="flex items-center gap-2 cursor-pointer">
      <input v-model="cardForm.enabled" type="checkbox" :disabled="cardSaving">
      <span class="font-medium">{{ t('card.stand.enabled') }}</span>
    </label>

    <div class="field">
      <label>{{ t('card.stand.reader') }}</label>
      <CommonSelectMenu v-model="cardForm.readerId" :options="readerOptions" wrapper-class="relative w-full" />
      <p v-if="readerOptions.length === 1" class="text-xs text-base-500">{{ t('card.stand.noReaders') }}</p>
    </div>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :saving="cardSaving"
        @cancel="closeCardModal"
        @submit="saveCard"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import type { EntityManagerColumn, SaveSettingsEntityBody, SettingsEntityRow } from './EntityManager.vue'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'

interface PickerItem {
  id: number
  name: string
  is_active: boolean
}

const { t } = useI18n()
const toast = useToast()

const managerRef = ref<{ loadItems: () => Promise<void> } | null>(null)
const allItems = ref<PickerItem[]>([])
const itemFilter = ref('')

const filteredItems = computed(() => {
  const needle = itemFilter.value.trim().toLowerCase()
  if (!needle) return allItems.value
  return allItems.value.filter(item => item.name.toLowerCase().includes(needle))
})

const { cardConfigured } = useCashRegisterSettings()

function cardSummary(item: unknown) {
  const stand = item as { card_enabled?: boolean, card_reader_name?: string | null, card_reader_ready?: boolean }
  if (!stand.card_enabled) return t('card.stand.off')
  if (!stand.card_reader_ready) return t('card.stand.noReader')
  return stand.card_reader_name ?? t('card.stand.on')
}

function cardTone(item: unknown) {
  const stand = item as { card_enabled?: boolean, card_reader_ready?: boolean }
  if (!stand.card_enabled) return 'baseMuted' as const
  return stand.card_reader_ready ? 'success' as const : 'warning' as const
}

const cardColumn: EntityManagerColumn = {
  key: 'card',
  label: t('card.stand.column'),
  filterable: false,
  sortable: false,
  getValue: item => cardSummary(item),
}

const baseColumns: EntityManagerColumn[] = [
  {
    key: 'item_count',
    label: t('stands.itemCount'),
    filterType: 'number',
    getValue: item => ((item as any).item_ids ?? []).length,
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

const columns = computed(() => cardConfigured.value ? [baseColumns[0]!, cardColumn, ...baseColumns.slice(1)] : baseColumns)

interface ReaderOption {
  id: number
  name: string
}

const showCardModal = ref(false)
const cardSaving = ref(false)
const cardStand = ref<SettingsEntityRow | null>(null)
const cardForm = ref<{ enabled: boolean, readerId: number | null }>({ enabled: false, readerId: null })
const readers = ref<ReaderOption[]>([])

const readerOptions = computed(() => [
  { value: null as number | null, label: t('card.stand.noReaderOption') },
  ...readers.value.map(reader => ({ value: reader.id as number | null, label: reader.name })),
])

async function loadReaders() {
  try {
    const res = await $fetch<any>('/api/card-readers')
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    readers.value = (res.readers as any[])
      .filter(reader => reader.is_active && reader.pairing_status === 'paired')
      .map(reader => ({ id: Number(reader.id), name: String(reader.name) }))
  } catch {
    toast.error(t('common.unknownError'))
  }
}

function openCardModal(item: SettingsEntityRow) {
  const stand = item as SettingsEntityRow & { card_enabled?: boolean, card_reader_id?: number | null }
  cardStand.value = item
  cardForm.value = { enabled: Boolean(stand.card_enabled), readerId: stand.card_reader_id ?? null }
  showCardModal.value = true
  loadReaders()
}

function closeCardModal() {
  if (cardSaving.value) return
  showCardModal.value = false
  cardStand.value = null
}

async function saveCard() {
  if (!cardStand.value) return
  cardSaving.value = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>('/api/stands/card', {
      method: 'POST',
      body: { id: cardStand.value.id, card_enabled: cardForm.value.enabled, card_reader_id: cardForm.value.readerId },
    })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    showCardModal.value = false
    cardStand.value = null
    await managerRef.value?.loadItems()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    cardSaving.value = false
  }
}

function selectedIds(entity: SaveSettingsEntityBody): number[] {
  return (entity.item_ids as number[] | undefined) ?? []
}

function toggleItem(entity: SaveSettingsEntityBody, id: number) {
  const ids = selectedIds(entity)
  entity.item_ids = ids.includes(id) ? ids.filter(entry => entry !== id) : [...ids, id]
}

function selectFiltered(entity: SaveSettingsEntityBody, select: boolean) {
  const visible = new Set(filteredItems.value.map(item => item.id))
  const kept = selectedIds(entity).filter(id => !visible.has(id))
  entity.item_ids = select ? [...kept, ...visible] : kept
}

function openPicker() {
  itemFilter.value = ''
  loadPickerItems()
}

function createItem(): SaveSettingsEntityBody {
  openPicker()
  return { name: '', item_ids: [] }
}

function mapEditItem(item: SettingsEntityRow): SaveSettingsEntityBody {
  openPicker()
  return { id: item.id, name: item.name, item_ids: [...((item as any).item_ids ?? [])] }
}

async function loadPickerItems() {
  try {
    const res = await $fetch<any>('/api/items')
    if (res.ok) {
      allItems.value = (res.items as any[]).map(item => ({
        id: Number(item.id),
        name: String(item.name),
        is_active: item.is_active === 1 || item.is_active === true,
      }))
      return
    }
    toast.error(res.error || t('stands.itemsLoadFailed'))
  } catch {
    toast.error(t('stands.itemsLoadFailed'))
  }
}

function handleError(context: { phase: string, message?: string }) {
  if (context.phase === 'delete' && context.message === 'Stand is used by existing orders') {
    toast.error(t('stands.deleteBlockedByOrders'))
    return
  }

  toast.error(context.message || t('common.unknownError'))
}

onMounted(() => {
  useAppRefresh().onRefresh(async () => {
    await managerRef.value?.loadItems()
  })
})
</script>
