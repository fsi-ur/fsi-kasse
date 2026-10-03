<template>
  <div v-if="activeStands.length > 0" class="w-40 md:w-52">
    <CommonSearchSelect
      v-model="query"
      :options="options"
      :placeholder="t('select.stand')"
      :empty-text="t('select.noStands')"
      :selected-label="effectiveStand?.name ?? ''"
      @select="onSelect"
      @clear-selection="clearSelection"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'
import { onOfflineDataChanged } from '~/composables/useOfflineQueue'

const query = ref('')
const { selectedStand } = useCheckout()
const { activeStands, effectiveStand, load } = useStands()
const { t } = useI18n()

const options = computed<SearchSelectOption[]>(() => activeStands.value.map(stand => ({
  key: stand.id,
  label: stand.name,
  value: stand.id,
})))

function onSelect(value: unknown) {
  selectedStand.value = Number(value)
  query.value = ''
}

function clearSelection() {
  selectedStand.value = ''
}

onMounted(load)
useAppRefresh().onRefresh(load)
onOfflineDataChanged(load)
</script>
