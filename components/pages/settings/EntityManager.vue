<template>
  <div
    v-if="readOnly"
    class="col-span-12 p-4 bg-amber-50 text-amber-900 shadow-lg rounded-xl border border-amber-200 text-sm"
  >
    {{ readOnlyNotice }}
  </div>

  <CommonPageTableCard
    v-if="canManage"
    :title="title"
    :persist-key="persistKey"
    :search-value="search"
    :can-create="!readOnly"
    :create-label="`+ ${addLabel}`"
    @update:search-value="search = $event"
    @create="addItem"
  >
    <CommonAdvancedTable
      v-model:search="search"
      :persist-key="persistKey"
      :rows="displayItems"
      :columns="columns"
      :empty-text="emptyLabel"
      :show-actions="!readOnly"
      :can-open-row="() => editable"
      @row-open="editItem($event)"
    >
      <template
        v-for="column in columnsWithSlot"
        :key="column.key"
        #[cellSlotName(column.key)]="{ row }"
      >
        <slot
          :name="`cell-${column.key}`"
          :item="row"
          :items="items"
          :display-items="displayItems"
        />
      </template>

      <template #actions="{ row }">
        <slot
          name="actions"
          :item="row"
          :items="items"
          :display-items="displayItems"
          :edit="() => editItem(row)"
          :toggle="() => toggleActive(row)"
          :reload="loadItems"
        >
          <button v-if="editable" class="text-blue-600 hover:underline cursor-pointer" @click="editItem(row)">
            {{ t('actions.edit') }}
          </button>

          <button
            class="hover:underline cursor-pointer"
            :class="row.is_active ? 'text-red-500' : 'text-gray-500'"
            @click="toggleActive(row)"
          >
            {{ row.is_active ? t('actions.deactivate') : t('actions.activate') }}
          </button>

          <button
            v-if="deleteEndpoint"
            class="text-red-600 hover:underline cursor-pointer"
            @click="itemToDelete = row"
          >
            {{ t('actions.remove') }}
          </button>
        </slot>
      </template>
    </CommonAdvancedTable>
  </CommonPageTableCard>

  <CommonModal
    v-if="editingItem"
    v-model="showModal"
    :title="isNewItem ? t('actions.createNew') + ': ' + singularLabel : singularLabel"
    :width-class="modalWidthClass"
    @close="closeModal"
  >
    <div class="field">
      <label>{{ t('common.name') }}</label>
      <input v-model="editingItem.name" class="input" />
    </div>

    <slot
      name="modal-fields"
      :editing-item="editingItem"
      :is-new-item="isNewItem"
      :items="items"
      :display-items="displayItems"
    />

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="isSaving"
        @cancel="closeModal"
        @submit="saveItem"
      />
    </template>
  </CommonModal>

  <FormConfirmation
    v-if="itemToDelete"
    :headline="deleteConfirmTitle"
    @confirm="confirmDelete"
    @cancel="itemToDelete = null"
  >
    <template #message>
      {{ deleteConfirmQuestion ? deleteConfirmQuestion(itemToDelete) : '' }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import type { AdvancedTableColumn, TableFilterType } from '~/composables/useAdvancedTable'

export interface SettingsEntityRow {
  id: number
  name: string
  is_active: boolean
}

export interface SaveSettingsEntityBody {
  id?: number
  name: string
  [key: string]: unknown
}

export interface EntityManagerColumn {
  key: string
  label: string
  headerClass?: string
  filterType?: TableFilterType
  sortable?: boolean
  filterable?: boolean
  globalSearchable?: boolean
  mobile?: 'title' | 'meta' | 'hidden'
  format?: (item: SettingsEntityRow) => string
  getValue?: (item: SettingsEntityRow, items: SettingsEntityRow[]) => unknown
}

interface EntityManagerErrorContext {
  phase: 'load' | 'save' | 'toggle' | 'delete'
  message?: string
  error?: unknown
}

const props = withDefaults(defineProps<{
  title: string
  singularLabel: string
  addLabel: string
  emptyLabel: string
  /** Unique, stable key to persist this table's sort/filter/search state across page navigation. */
  persistKey?: string
  listEndpoint: string
  /** Create endpoint (used when editingItem has no id). Also used for edits when updateEndpoint is not set. */
  saveEndpoint: string
  /** Optional separate update endpoint, used when editingItem has an id. When neither this nor a matching update flow exists, set editable to false instead of guessing at create/update semantics. */
  updateEndpoint?: string
  activateEndpoint: string
  deleteEndpoint?: string
  deleteConfirmTitle?: string
  deleteConfirmQuestion?: (item: SettingsEntityRow) => string
  responseListKey: string
  extraColumns?: EntityManagerColumn[]
  canManage?: boolean
  /** Whether rows can be opened for editing. Set to false when there is no update endpoint. */
  editable?: boolean
  readOnly?: boolean
  readOnlyNotice?: string
  createItem?: () => SaveSettingsEntityBody
  mapEditItem?: (item: SettingsEntityRow) => SaveSettingsEntityBody
  transformItems?: (items: SettingsEntityRow[]) => SettingsEntityRow[]
  onError?: (context: EntityManagerErrorContext) => void
  modalWidthClass?: string
}>(), {
  extraColumns: () => [],
  persistKey: undefined,
  canManage: true,
  editable: true,
  updateEndpoint: undefined,
  readOnly: false,
  readOnlyNotice: '',
  deleteEndpoint: undefined,
  deleteConfirmTitle: '',
  deleteConfirmQuestion: undefined,
  createItem: () => ({ name: '' }),
  mapEditItem: (item: SettingsEntityRow) => ({ ...item }),
  transformItems: (items: SettingsEntityRow[]) => items,
  onError: undefined,
  modalWidthClass: 'max-w-lg',
})

defineSlots<{
  [key: `cell-${string}`]: (props: {
    item: SettingsEntityRow
    items: SettingsEntityRow[]
    displayItems: SettingsEntityRow[]
  }) => any
  'actions'?: (props: {
    item: SettingsEntityRow
    items: SettingsEntityRow[]
    displayItems: SettingsEntityRow[]
    edit: () => void
    toggle: () => Promise<void>
    reload: () => Promise<void>
  }) => any
  'modal-fields'?: (props: {
    editingItem: SaveSettingsEntityBody
    isNewItem: boolean
    items: SettingsEntityRow[]
    displayItems: SettingsEntityRow[]
  }) => any
}>()

const slots = useSlots()
const { t } = useI18n()
const toast = useToast()
const items = ref<SettingsEntityRow[]>([])
const displayItems = computed(() => props.transformItems(items.value))
const search = ref('')

function getFallbackColumnValue(item: SettingsEntityRow, key: string) {
  return (item as unknown as Record<string, unknown>)[key] ?? '-'
}

function cellSlotName(key: string) {
  return `cell-${key}`
}

const columns = computed<AdvancedTableColumn<SettingsEntityRow>[]>(() => [
  {
    key: 'name',
    label: t('common.name'),
    filterable: false,
    globalSearchable: true,
    getValue: item => item.name,
    mobile: 'title',
  },
  ...props.extraColumns.map(column => ({
    key: column.key,
    label: column.label,
    headerClass: column.headerClass,
    filterType: column.filterType || ('text' as const),
    sortable: column.sortable,
    filterable: column.filterable,
    globalSearchable: column.globalSearchable ?? false,
    mobile: column.mobile,
    format: column.format,
    getValue: (item: SettingsEntityRow) => column.getValue?.(item, items.value) ?? getFallbackColumnValue(item, column.key),
  })),
])

const columnsWithSlot = computed(() => columns.value.filter(column => !!slots[cellSlotName(column.key)]))

const showModal = ref(false)
const editingItem = ref<SaveSettingsEntityBody | null>(null)
const isNewItem = ref(false)
const isSaving = ref(false)
const itemToDelete = ref<SettingsEntityRow | null>(null)

function reportError(phase: EntityManagerErrorContext['phase'], message?: string, error?: unknown) {
  if (props.onError) {
    props.onError({ phase, message, error })
    return
  }

  toast.error(message || t('common.unknownError'))
}

async function loadItems() {
  try {
    const res = await $fetch<Record<string, any>>(props.listEndpoint)
    if (res.ok) {
      items.value = (res[props.responseListKey] ?? []) as SettingsEntityRow[]
      return
    }

    reportError('load', res.error)
  } catch (error) {
    reportError('load', undefined, error)
  }
}

function addItem() {
  editingItem.value = props.createItem()
  isNewItem.value = true
  showModal.value = true
}

function editItem(item: SettingsEntityRow) {
  if (!props.editable) return
  editingItem.value = props.mapEditItem(item)
  isNewItem.value = false
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingItem.value = null
}

async function saveItem() {
  if (!editingItem.value || isSaving.value) return

  try {
    isSaving.value = true
    const endpoint = editingItem.value.id && props.updateEndpoint ? props.updateEndpoint : props.saveEndpoint
    const res = await $fetch<{ ok: boolean, error?: string }>(endpoint, {
      method: 'POST',
      body: editingItem.value,
    })
    if (!res.ok) {
      reportError('save', res.error)
      return
    }

    closeModal()
    toast.success(t('common.saved'))
    await loadItems()
  } catch (error) {
    reportError('save', undefined, error)
  } finally {
    isSaving.value = false
  }
}

async function toggleActive(item: SettingsEntityRow) {
  try {
    const res = await $fetch<{ ok: boolean, error?: string }>(props.activateEndpoint, {
      method: 'POST',
      body: { id: item.id, is_active: !item.is_active },
    })
    if (!res.ok) {
      reportError('toggle', res.error)
      return
    }

    await loadItems()
  } catch (error) {
    reportError('toggle', undefined, error)
  }
}

async function confirmDelete() {
  if (!itemToDelete.value || !props.deleteEndpoint) return

  const id = itemToDelete.value.id
  itemToDelete.value = null

  try {
    const res = await $fetch<{ ok: boolean, error?: string, code?: string }>(props.deleteEndpoint, {
      method: 'POST',
      body: { id },
    })
    if (!res.ok) {
      reportError('delete', res.error)
      return
    }

    toast.success(t('common.deleted'))
    await loadItems()
  } catch (error) {
    reportError('delete', undefined, error)
  }
}

watch(() => props.canManage, async (canManage) => {
  if (!canManage) {
    items.value = []
    closeModal()
    return
  }

  await loadItems()
}, { immediate: true })

defineExpose({
  loadItems,
})
</script>
