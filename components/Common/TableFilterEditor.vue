<template>
  <div class="flex flex-col">
    <template v-if="filterType === 'text'">
      <div class="relative border-b border-base-200">
        <Icon
          name="material-symbols:search-rounded"
          class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-400"
        />
        <input
          ref="searchInputRef"
          v-model="textSearchInput"
          type="text"
          class="w-full border-0 bg-transparent py-2.5 pl-8 pr-8 text-xs text-base-800 placeholder:text-base-400 focus:outline-none"
          :placeholder="t('common.searchFilter')"
          @keydown.enter.prevent="onConfirm"
        >
        <button
          v-if="textSearchInput !== ''"
          type="button"
          class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-base-400 transition cursor-pointer hover:bg-base-100 hover:text-base-600"
          :aria-label="t('common.clearSearch')"
          @click="clearTextSearch"
        >
          <Icon name="material-symbols:close-rounded" class="h-4 w-4" />
        </button>
      </div>

      <div
        v-if="filteredTextOptions.length > 0"
        class="flex items-center justify-between gap-2 border-b border-base-200 bg-base-50/60 px-2.5 py-1.5"
      >
        <button
          type="button"
          class="text-[11px] font-medium text-link-600 transition cursor-pointer hover:text-link-700 hover:underline"
          @click="toggleAllVisible"
        >
          {{ allVisibleSelected ? t('common.deselectAll') : t('common.selectAll') }}
        </button>
        <span class="text-[11px] text-base-500 tabular-nums">
          {{ t('common.selectedCount', { count: selectedValues.size }) }}
        </span>
      </div>

      <div class="max-h-56 overflow-y-auto py-1">
        <label
          v-for="option in visibleTextOptions"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs transition hover:bg-base-50"
        >
          <input
            type="checkbox"
            class="checkbox shrink-0"
            :checked="selectedValues.has(option.value)"
            @change="toggleTextOption(option.value)"
          >
          <span class="min-w-0 flex-1 truncate text-base-800" :title="option.value">{{ option.value }}</span>
          <span class="shrink-0 text-[11px] text-base-400 tabular-nums">{{ option.count }}</span>
        </label>

        <p v-if="filteredTextOptions.length === 0" class="px-2.5 py-3 text-center text-xs text-base-400">
          {{ textSearchInput.trim() ? t('common.noResults') : t('common.noEntries') }}
        </p>
        <p
          v-else-if="filteredTextOptions.length > MAX_FILTER_OPTIONS"
          class="border-t border-base-100 px-2.5 pt-1.5 pb-0.5 text-[11px] text-base-500"
        >
          {{ t('common.firstOptionsShown', { count: MAX_FILTER_OPTIONS }) }}
        </p>
      </div>
    </template>

    <template v-else-if="filterType === 'date'">
      <div class="space-y-2 p-2.5">
        <div class="flex items-center gap-2">
          <label class="w-8 shrink-0 text-xs text-base-600">{{ t('common.from') }}</label>
          <CommonDateInput
            v-model="rangeMin"
            size="sm"
            class="w-full"
            @keydown.enter.prevent="onConfirm"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="w-8 shrink-0 text-xs text-base-600">{{ t('common.to') }}</label>
          <CommonDateInput
            v-model="rangeMax"
            size="sm"
            class="w-full"
            @keydown.enter.prevent="onConfirm"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="space-y-2 p-2.5">
        <div class="flex items-center gap-2">
          <label class="w-8 shrink-0 text-xs text-base-600">{{ t('common.from') }}</label>
          <input
            v-model="rangeMin"
            type="text"
            inputmode="decimal"
            class="w-full rounded-lg border border-base-300 px-2 py-1.5 text-xs text-base-800 placeholder:text-base-400 focus:border-link-500 focus:outline-none"
            :placeholder="minPlaceholder"
            @keydown.enter.prevent="onConfirm"
          >
        </div>
        <div class="flex items-center gap-2">
          <label class="w-8 shrink-0 text-xs text-base-600">{{ t('common.to') }}</label>
          <input
            v-model="rangeMax"
            type="text"
            inputmode="decimal"
            class="w-full rounded-lg border border-base-300 px-2 py-1.5 text-xs text-base-800 placeholder:text-base-400 focus:border-link-500 focus:outline-none"
            :placeholder="maxPlaceholder"
            @keydown.enter.prevent="onConfirm"
          >
        </div>
      </div>
    </template>

    <p
      v-if="rangeInverted"
      class="flex items-start gap-1.5 border-t border-base-200 bg-danger-50 px-2.5 py-1.5 text-[11px] text-danger-700"
    >
      <Icon name="material-symbols:error-outline-rounded" class="mt-px h-3.5 w-3.5 shrink-0" />
      {{ t('common.filterRangeInverted') }}
    </p>

    <div class="grid grid-cols-2 gap-2 border-t border-base-200 bg-base-50/60 p-2">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-medium text-base-600 transition not-disabled:cursor-pointer not-disabled:hover:bg-base-200/70 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!hasWorkingValue"
        @click="onReset"
      >
        {{ t('actions.reset') }}
      </button>
      <button
        type="button"
        class="btn-primary px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-500"
        :disabled="rangeInverted"
        @click="onConfirm"
      >
        {{ t('actions.apply') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import type { ColumnFilter, TableFilterType, TextFilterOption } from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  filterType?: TableFilterType
  filter?: ColumnFilter
  textOptions?: TextFilterOption[]
  numberBounds?: { min: number, max: number } | null
  autofocus?: boolean
}>(), {
  filterType: 'text',
  filter: () => ({ type: 'text', selected: [] }),
  numberBounds: null,
  autofocus: false,
})

const emit = defineEmits<{
  (e: 'apply-text-filter', values: string[]): void
  (e: 'apply-range-filter', payload: { min: string, max: string }): void
  (e: 'reset-filter'): void
}>()

const textSearchInput = ref('')
const selectedValues = ref<Set<string>>(new Set())
const rangeMin = ref('')
const rangeMax = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const pinnedValues = ref<Set<string>>(new Set())
const MAX_FILTER_OPTIONS = 200
const { t } = useI18n()

const filteredTextOptions = computed(() => {
  const options = props.textOptions ?? []
  const term = textSearchInput.value.trim().toLocaleLowerCase('de-DE')
  const matching = term
    ? options.filter(option => option.value.toLocaleLowerCase('de-DE').includes(term))
    : options
  const pinned = pinnedValues.value
  if (pinned.size === 0) return matching
  return [...matching].sort((a, b) => Number(pinned.has(b.value)) - Number(pinned.has(a.value)))
})
const visibleTextOptions = computed(() => filteredTextOptions.value.slice(0, MAX_FILTER_OPTIONS))
const allVisibleSelected = computed(() => {
  const options = filteredTextOptions.value
  return options.length > 0 && options.every(option => selectedValues.value.has(option.value))
})

const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const minPlaceholder = computed(() => props.numberBounds ? numberFormatter.format(props.numberBounds.min) : '')
const maxPlaceholder = computed(() => props.numberBounds ? numberFormatter.format(props.numberBounds.max) : '')

const rangeInverted = computed(() => {
  if (props.filterType === 'text') return false
  if (rangeMin.value.trim() === '' || rangeMax.value.trim() === '') return false
  if (props.filterType === 'date') return rangeMin.value > rangeMax.value
  const min = parseLooseNumber(rangeMin.value)
  const max = parseLooseNumber(rangeMax.value)
  return min !== null && max !== null && min > max
})

const hasWorkingValue = computed(() => {
  if (props.filterType === 'text') return selectedValues.value.size > 0 || textSearchInput.value !== ''
  return rangeMin.value !== '' || rangeMax.value !== ''
})

function parseLooseNumber(value: string): number | null {
  const numeric = Number(value.trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : null
}

function syncFromFilter() {
  if (props.filter.type === 'text') {
    selectedValues.value = new Set(props.filter.selected)
    pinnedValues.value = new Set(props.filter.selected)
    rangeMin.value = ''
    rangeMax.value = ''
    return
  }

  rangeMin.value = props.filter.min
  rangeMax.value = props.filter.max
  selectedValues.value = new Set()
  pinnedValues.value = new Set()
}

function clearTextSearch() {
  textSearchInput.value = ''
  searchInputRef.value?.focus()
}

function toggleTextOption(option: string) {
  const next = new Set(selectedValues.value)
  if (next.has(option)) next.delete(option)
  else next.add(option)
  selectedValues.value = next
}

function toggleAllVisible() {
  const next = new Set(selectedValues.value)
  const deselect = allVisibleSelected.value
  for (const option of filteredTextOptions.value) {
    if (deselect) next.delete(option.value)
    else next.add(option.value)
  }
  selectedValues.value = next
}

function onReset() {
  textSearchInput.value = ''
  selectedValues.value = new Set()
  pinnedValues.value = new Set()
  rangeMin.value = ''
  rangeMax.value = ''
  emit('reset-filter')
}

function onConfirm() {
  if (rangeInverted.value) return

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

if (props.autofocus) {
  nextTick(() => searchInputRef.value?.focus())
}
</script>
