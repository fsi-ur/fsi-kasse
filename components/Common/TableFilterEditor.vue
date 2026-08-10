<template>
  <div>
    <template v-if="filterType === 'text'">
      <div class="grid grid-cols-[1fr_auto] gap-0">
        <input
          v-model="textSearchInput"
          type="text"
          class="w-full border-0 border-b border-r border-slate-300 rounded-tl-lg px-2 py-2 text-xs"
          :placeholder="t('common.searchFilter')"
          @keydown.enter.prevent="applyTextSearch"
        >
        <button
          type="button"
          class="px-3 py-2 text-xs border-0 border-b border-slate-300 hover:bg-slate-50 cursor-pointer"
          @click="applyTextSearch"
        >
          <Icon name="material-symbols:search-rounded" class="w-4 h-4" />
        </button>
      </div>

      <div class="max-h-54 overflow-y-auto px-2 py-1 space-y-1">
        <label
          v-for="option in visibleTextOptions"
          :key="option"
          class="flex items-center gap-2 text-xs cursor-pointer"
        >
          <input
            type="checkbox"
            class="checkbox"
            :checked="selectedValues.has(option)"
            @change="toggleTextOption(option)"
          >
          <span class="truncate">{{ option }}</span>
        </label>
        <div v-if="filteredTextOptions.length === 0" class="text-xs text-slate-400">
          {{ t('common.noEntries') }}
        </div>
        <div v-else-if="filteredTextOptions.length > MAX_FILTER_OPTIONS" class="text-[11px] text-slate-500 pt-1">
          {{ t('common.firstOptionsShown', { count: MAX_FILTER_OPTIONS }) }}
        </div>
      </div>
    </template>

    <template v-else-if="filterType === 'date'">
      <div class="px-2 pt-2 flex items-center gap-2">
        <label class="text-xs text-slate-600 w-8 shrink-0">{{ t('common.from') }}</label>
        <CommonDateInput
          v-model="rangeMin"
          size="sm"
          class="w-full"
          @keydown.enter.prevent="onConfirm"
        />
      </div>
      <div class="px-2 py-2 flex items-center gap-2">
        <label class="text-xs text-slate-600 w-8 shrink-0">{{ t('common.to') }}</label>
        <CommonDateInput
          v-model="rangeMax"
          size="sm"
          class="w-full"
          @keydown.enter.prevent="onConfirm"
        />
      </div>
    </template>

    <template v-else>
      <div class="px-2 pt-2 space-y-1">
        <label class="text-xs text-slate-600">{{ t('common.from') }}</label>
        <input
          v-model="rangeMin"
          type="text"
          inputmode="decimal"
          class="w-full border border-slate-300 rounded px-2 py-1 text-xs"
          @keydown.enter.prevent="onConfirm"
        >
      </div>
      <div class="px-2 py-2 space-y-1">
        <label class="text-xs text-slate-600">{{ t('common.to') }}</label>
        <input
          v-model="rangeMax"
          type="text"
          inputmode="decimal"
          class="w-full border border-slate-300 rounded px-2 py-1 text-xs"
          @keydown.enter.prevent="onConfirm"
        >
      </div>
    </template>

    <div class="grid grid-cols-2 gap-0 border-t border-slate-300">
      <button
        type="button"
        class="px-3 py-2 border-0 border-r border-slate-300 text-xs hover:bg-slate-50 cursor-pointer"
        @click="onReset"
      >
        {{ t('actions.reset') }}
      </button>
      <button
        type="button"
        class="px-3 py-2 text-xs btn-primary rounded-none"
        @click="onConfirm"
      >
        {{ t('actions.confirm') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import type { ColumnFilter, TableFilterType } from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  filterType?: TableFilterType
  filter?: ColumnFilter
  textOptions?: string[]
}>(), {
  filterType: 'text',
  filter: () => ({ type: 'text', selected: [] }),
})

const emit = defineEmits<{
  (e: 'apply-text-filter', values: string[]): void
  (e: 'apply-range-filter', payload: { min: string, max: string }): void
  (e: 'reset-filter'): void
}>()

const textSearchInput = ref('')
const textSearchApplied = ref('')
const selectedValues = ref<Set<string>>(new Set())
const rangeMin = ref('')
const rangeMax = ref('')
const MAX_FILTER_OPTIONS = 200
const { t } = useI18n()

const filteredTextOptions = computed(() => {
  const options = props.textOptions ?? []
  const term = textSearchApplied.value.trim().toLocaleLowerCase('de-DE')
  if (!term) return options
  return options.filter(option => option.toLocaleLowerCase('de-DE').includes(term))
})
const visibleTextOptions = computed(() => filteredTextOptions.value.slice(0, MAX_FILTER_OPTIONS))

function syncFromFilter() {
  if (props.filter.type === 'text') {
    selectedValues.value = new Set(props.filter.selected)
    rangeMin.value = ''
    rangeMax.value = ''
    return
  }

  rangeMin.value = props.filter.min
  rangeMax.value = props.filter.max
  selectedValues.value = new Set()
}

function applyTextSearch() {
  textSearchApplied.value = textSearchInput.value
}

function toggleTextOption(option: string) {
  const next = new Set(selectedValues.value)
  if (next.has(option)) next.delete(option)
  else next.add(option)
  selectedValues.value = next
}

function onReset() {
  textSearchInput.value = ''
  textSearchApplied.value = ''
  selectedValues.value = new Set()
  rangeMin.value = ''
  rangeMax.value = ''
  emit('reset-filter')
}

function onConfirm() {
  if (props.filterType === 'text') {
    emit('apply-text-filter', Array.from(selectedValues.value))
  } else {
    emit('apply-range-filter', {
      min: rangeMin.value,
      max: rangeMax.value,
    })
  }
}

watch(
  () => props.filter,
  syncFromFilter,
  { deep: true, immediate: true },
)
</script>
