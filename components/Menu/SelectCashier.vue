<template>
  <div class="w-40 md:w-52">
    <CommonSearchSelect
      v-model="query"
      :options="options"
      :placeholder="t('select.cashier')"
      :empty-text="t('select.noCashiers')"
      :selected-label="selectedLabel"
      @select="onSelect"
      @clear-selection="clearSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged } from '~/composables/useOfflineQueue'

const cashiers = ref<any[]>([])
const query = ref('')
const { selectedCashier, selectedCashierName, selectedEventAffiliations } = useCheckout()
const { t } = useI18n()

// Affiliated guest cashiers only work events that allow their affiliation (the server enforces it too).
const eventCashiers = computed(() => {
  const allowed = selectedEventAffiliations.value
  if (!allowed) return cashiers.value
  const allowedIds = new Set(allowed.map(entry => entry.affiliation_id))
  return cashiers.value.filter(cashier => !cashier.is_guest || cashier.affiliation_id == null || allowedIds.has(cashier.affiliation_id))
})

const options = computed<SearchSelectOption[]>(() => eventCashiers.value.map(cashier => ({
  key: cashier.id,
  label: String(cashier.name),
  value: cashier.id,
})))

const selectedLabel = computed(() => {
  const cashier = eventCashiers.value.find(entry => entry.id === selectedCashier.value)
  return cashier ? String(cashier.name) : ''
})

watch(eventCashiers, (list) => {
  if (!cashiers.value.length || !selectedCashier.value) return
  if (!list.some(entry => entry.id === selectedCashier.value)) selectedCashier.value = ''
})

watch(selectedLabel, (label) => {
  selectedCashierName.value = label
}, { immediate: true })

function onSelect(value: unknown) {
  selectedCashier.value = Number(value)
  query.value = ''
}

function clearSelection() {
  selectedCashier.value = ''
}

async function loadCashiers() {
  let result
  try {
    result = await cachedFetch<any>('/api/cashiers')
  } catch {
    return
  }

  const res = result.data
  if (res.ok) {
    const allCashiers = 'cashiers' in res ? res.cashiers as any[] : []
    cashiers.value = allCashiers.filter(i => i.is_active === 1 || i.is_active === true)

    if (!result.stale && selectedCashier.value && !cashiers.value.some(entry => entry.id === selectedCashier.value)) {
      selectedCashier.value = ''
    }
  }
}

onMounted(loadCashiers)
useAppRefresh().onRefresh(loadCashiers)
onOfflineDataChanged(loadCashiers)
</script>
