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
const { selectedCashier, selectedCashierName } = useCheckout()
const { t } = useI18n()

const options = computed<SearchSelectOption[]>(() => cashiers.value.map(cashier => ({
  key: cashier.id,
  label: String(cashier.name),
  value: cashier.id,
})))

const selectedLabel = computed(() => {
  const cashier = cashiers.value.find(entry => entry.id === selectedCashier.value)
  return cashier ? String(cashier.name) : ''
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
