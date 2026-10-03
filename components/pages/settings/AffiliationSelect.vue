<template>
  <div class="field">
    <label>{{ t('affiliations.label') }}</label>
    <CommonSearchSelect
      v-model="query"
      :options="options"
      :placeholder="t('affiliations.search')"
      :empty-text="t('affiliations.noMatches')"
      :selected-label="selectedLabel"
      :disabled="locked"
      @select="onSelect"
      @clear-selection="onSelect(null)"
    />
    <p v-if="locked" class="text-xs text-base-500">{{ t('affiliations.lockedHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

export interface AffiliationOption {
  id: number
  name: string
  is_active: boolean
}

const props = defineProps<{
  modelValue: number | null
  affiliations: AffiliationOption[]
  /** Scoped guest managers can only assign their own affiliation (the server enforces it too). */
  locked?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
}>()

const { t } = useI18n()
const query = ref('')

function affiliationLabel(affiliation: AffiliationOption) {
  return affiliation.is_active ? affiliation.name : t('affiliations.inactiveSuffix', { name: affiliation.name })
}

// Inactive affiliations can't be newly assigned, but one already set stays selectable.
const options = computed<SearchSelectOption[]>(() => [
  { key: 'none', label: t('affiliations.noneOption'), value: null },
  ...props.affiliations
    .filter(affiliation => affiliation.is_active || affiliation.id === props.modelValue)
    .map(affiliation => ({ key: affiliation.id, label: affiliationLabel(affiliation), value: affiliation.id })),
])

const selectedLabel = computed(() => {
  const selected = props.affiliations.find(affiliation => affiliation.id === props.modelValue)
  return selected ? affiliationLabel(selected) : t('affiliations.noneOption')
})

function onSelect(value: unknown) {
  emit('update:modelValue', value == null ? null : Number(value))
  query.value = ''
}
</script>
