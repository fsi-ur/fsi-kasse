<template>
  <CommonPageTableCard
    :title="currentStand ? currentStand.name : t('myStands.title')"
    persist-key="settings-my-stands"
    :search-value="search"
    :can-create="!!currentStand"
    :create-label="`+ ${t('myStands.newItem')}`"
    @update:search-value="search = $event"
    @create="openItemModal(null)"
  >
    <template #actions>
      <CommonSelectMenu
        v-if="stands.length > 1"
        v-model="selectedStandId"
        :options="standOptions"
        wrapper-class="relative w-48 max-w-full"
        trigger-class="py-1.75"
      />
      <div v-if="currentStand" class="w-48 max-w-full">
        <CommonSearchSelect
          v-model="addQuery"
          :options="addOptions"
          :placeholder="t('myStands.addItem')"
          :empty-text="t('stands.noItemsMatch')"
          input-class="py-1.75"
          :disabled="busy"
          @select="addItem"
        />
      </div>
    </template>

    <p v-if="!loading && !currentStand" class="text-sm text-base-600">{{ t('myStands.none') }}</p>

    <template v-else>
      <p v-if="currentStand?.event_names.length" class="text-sm text-base-600">
        {{ t('myStands.events', { names: currentStand.event_names.join(', ') }) }}
      </p>

      <CommonAdvancedTable
        v-model:search="search"
        :loading="loading"
        persist-key="settings-my-stands"
        :rows="standItems"
        :columns="columns"
        :empty-text="t('myStands.noItems')"
        show-actions
        :can-open-row="row => row.editable"
        @row-open="openItemModal($event)"
      >
        <template #cell-name="{ row }">
          <span class="inline-flex flex-wrap items-center gap-2">
            {{ row.name }}
            <CommonStatusBadge v-if="!row.editable" :label="t('myStands.shared')" tone="baseMuted" />
          </span>
        </template>

        <template #cell-is_active="{ row }">
          <CommonStatusBadge
            :label="row.is_active ? t('common.active') : t('common.inactive')"
            :tone="row.is_active ? 'success' : 'baseMuted'"
          />
        </template>

        <template #actions="{ row }">
          <button v-if="row.editable" class="text-link-600 hover:underline cursor-pointer" @click="openItemModal(row)">
            {{ t('actions.edit') }}
          </button>
          <button class="text-danger-600 hover:underline cursor-pointer" :disabled="busy" @click="removeItem(row)">
            {{ t('myStands.removeItem') }}
          </button>
        </template>
      </CommonAdvancedTable>

      <p class="text-xs text-base-500">{{ t('myStands.sharedHint') }}</p>
    </template>
  </CommonPageTableCard>

  <CommonModal
    v-model="showItemModal"
    :title="editedItem ? t('myStands.editItem', { name: editedItem.name }) : t('myStands.newItem')"
    @close="closeItemModal"
  >
    <div class="field">
      <label>{{ t('items.itemName') }}</label>
      <input v-model="itemForm.name" class="input" autocomplete="off" :disabled="busy">
    </div>

    <div class="flex gap-4">
      <div class="field flex-1">
        <label>{{ t('common.price') }}</label>
        <input
          :value="itemForm.price"
          class="input"
          inputmode="decimal"
          :disabled="busy"
          @input="itemForm.price = sanitizeCurrencyInput(($event.target as HTMLInputElement).value)"
        >
      </div>
      <div class="field flex-1">
        <label>{{ t('common.deposit') }}</label>
        <input
          :value="itemForm.deposit"
          class="input"
          inputmode="decimal"
          :disabled="busy"
          @input="itemForm.deposit = sanitizeCurrencyInput(($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <p v-if="editedItem" class="text-sm text-base-600">{{ t('items.priceChangeNotice') }}</p>

    <template #footer>
      <CommonFormActions
        :cancel-label="t('actions.cancel')"
        :submit-label="t('actions.save')"
        :save-disabled="!itemForm.name.trim() || itemForm.price === ''"
        :saving="busy"
        @cancel="closeItemModal"
        @submit="saveItem"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { parseCurrencyInput, sanitizeCurrencyInput } from '~/composables/useCurrencyInput'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

interface OwnStand {
  id: number
  name: string
  item_ids: number[]
  event_names: string[]
}

interface StandItem {
  id: number
  name: string
  price: number
  deposit: number
  is_active: boolean
  /** Sold only at this affiliation's stands, so the guest manager may change it. */
  editable: boolean
}

const { t } = useI18n()
const toast = useToast()
const { formatCurrency } = useLocaleFormatters()

const loading = ref(true)
const busy = ref(false)
const search = ref('')
const addQuery = ref('')
const stands = ref<OwnStand[]>([])
const items = ref<StandItem[]>([])
const selectedStandId = ref<number | null>(null)

const currentStand = computed(() => stands.value.find(stand => stand.id === selectedStandId.value) ?? null)
const standOptions = computed(() => stands.value.map(stand => ({ value: stand.id as number | null, label: stand.name })))

const standItems = computed(() => {
  const ids = new Set(currentStand.value?.item_ids ?? [])
  return items.value.filter(item => ids.has(item.id))
})

const addOptions = computed<SearchSelectOption[]>(() => {
  const ids = new Set(currentStand.value?.item_ids ?? [])
  return items.value
    .filter(item => !ids.has(item.id) && item.is_active)
    .map(item => ({ key: item.id, label: item.name, value: item.id }))
})

const columns: AdvancedTableColumn<StandItem>[] = [
  { key: 'name', label: t('items.itemName'), mobile: 'title', getValue: item => item.name },
  { key: 'price', label: t('common.price'), filterType: 'number', getValue: item => item.price, format: item => formatCurrency(item.price) },
  { key: 'deposit', label: t('common.deposit'), filterType: 'number', getValue: item => item.deposit, format: item => formatCurrency(item.deposit) },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

watch(stands, (list) => {
  if (!list.some(stand => stand.id === selectedStandId.value)) selectedStandId.value = list[0]?.id ?? null
})

async function load() {
  try {
    const res = await $fetch<any>('/api/stands/mine')
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    stands.value = (res.stands as any[]).map(stand => ({
      id: Number(stand.id),
      name: String(stand.name),
      item_ids: (stand.item_ids as unknown[]).map(Number),
      event_names: (stand.event_names as unknown[]).map(String),
    }))
    items.value = (res.items as any[]).map(item => ({
      id: Number(item.id),
      name: String(item.name),
      price: Number(item.price),
      deposit: Number(item.deposit ?? 0),
      is_active: item.is_active === 1 || item.is_active === true,
      editable: Boolean(item.editable),
    }))
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

function saveAssortment(itemIds: number[]) {
  if (!currentStand.value) return Promise.resolve(false)
  return post('/api/stands/assortment', { id: currentStand.value.id, item_ids: itemIds })
}

async function addItem(value: unknown) {
  addQuery.value = ''
  if (!currentStand.value) return
  await saveAssortment([...currentStand.value.item_ids, Number(value)])
}

async function removeItem(item: StandItem) {
  if (!currentStand.value) return
  await saveAssortment(currentStand.value.item_ids.filter(id => id !== item.id))
}

const showItemModal = ref(false)
const editedItem = ref<StandItem | null>(null)
const itemForm = ref({ name: '', price: '', deposit: '' })

function openItemModal(item: StandItem | null) {
  editedItem.value = item
  itemForm.value = item
    ? { name: item.name, price: String(item.price), deposit: String(item.deposit) }
    : { name: '', price: '', deposit: '' }
  showItemModal.value = true
}

function closeItemModal() {
  if (busy.value) return
  showItemModal.value = false
  editedItem.value = null
}

async function saveItem() {
  const form = itemForm.value
  const body = {
    name: form.name.trim(),
    price: parseCurrencyInput(form.price),
    deposit: parseCurrencyInput(form.deposit),
  }

  const done = editedItem.value
    ? await post('/api/items/update', { id: editedItem.value.id, ...body })
    : await post('/api/items/create', { ...body, stand_id: currentStand.value?.id })

  if (done) {
    showItemModal.value = false
    editedItem.value = null
  }
}

onMounted(load)
useAppRefresh().onRefresh(load)
</script>
