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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import type { EntityManagerColumn, SaveSettingsEntityBody, SettingsEntityRow } from './EntityManager.vue'

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

const columns: EntityManagerColumn[] = [
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
