<template>
  <div class="space-y-3">
    <!-- Mobile toolbar: sorting, filtering, active filter chips -->
    <div
      v-if="sortableColumns.length > 0 || filterableColumns.length > 0"
      class="flex flex-wrap items-center gap-2"
      :class="{ 'xl:hidden': viewMode === 'table' }"
    >
      <button
        v-if="sortableColumns.length > 0"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm transition cursor-pointer hover:bg-base-50"
        :class="activeSortColumn ? 'border-link-500 text-link-600' : 'border-base-300 text-base-600'"
        @click="sortOpen = true"
      >
        <Icon name="material-symbols:swap-vert-rounded" class="text-base" />
        <span>{{ activeSortColumn ? activeSortColumn.label : t('common.sort') }}</span>
        <Icon v-if="activeSortColumn" :name="sortDirectionIcon" class="text-base" />
      </button>

      <button
        v-if="filterableColumns.length > 0"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm transition cursor-pointer hover:bg-base-50"
        :class="activeFilterColumns.length > 0 ? 'border-link-500 text-link-600' : 'border-base-300 text-base-600'"
        @click="filterOpen = true"
      >
        <Icon name="material-symbols:filter-list-rounded" class="text-base" />
        <span>{{ t('common.filter') }}</span>
        <span
          v-if="activeFilterColumns.length > 0"
          class="rounded-full bg-link-600 px-1.5 text-xs font-medium text-white"
        >
          {{ activeFilterColumns.length }}
        </span>
      </button>

      <button
        v-for="column in activeFilterColumns"
        :key="column.key"
        type="button"
        class="inline-flex max-w-full items-center gap-1 rounded-full bg-link-50 px-2.5 py-1 text-xs text-link-700 transition cursor-pointer hover:bg-link-100"
        :title="t('common.removeFilter', { label: column.label })"
        @click="resetFilter(column.key)"
      >
        <span class="font-medium">{{ column.label }}:</span>
        <span class="min-w-0 truncate">{{ filterSummary(column.key) }}</span>
        <Icon name="material-symbols:close-rounded" class="shrink-0 text-sm" />
      </button>

      <button
        v-if="activeFilterColumns.length > 1"
        type="button"
        class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-base-500 underline-offset-2 transition cursor-pointer hover:text-base-700 hover:underline"
        @click="resetAllFilters"
      >
        {{ t('common.resetAllFilters') }}
      </button>
    </div>

    <!-- Desktop table -->
    <div class="hidden overflow-x-auto" :class="{ 'xl:block': viewMode === 'table' }">
      <table class="w-full text-sm border-collapse" :class="tableClass">
        <thead>
          <tr class="text-left border-b">
            <th
              v-for="column in visibleColumns"
              :key="column.key"
              class="py-2"
              :class="column.headerClass"
            >
              <CommonTableColumnControl
                v-if="column.sortable !== false || column.filterable !== false"
                :label="column.label"
                :filter-type="column.filterType ?? 'text'"
                :filterable="column.filterable !== false"
                :sort-direction="sortKey === column.key ? sortDirection : null"
                :is-filter-active="isFilterActive(column.key)"
                :filter="getFilter(column.key)"
                :text-options="textOptionsByColumn[column.key]"
                :number-bounds="numberBoundsByColumn[column.key] ?? null"
                @toggle-sort="toggleSort(column.key)"
                @apply-text-filter="setTextFilter(column.key, $event)"
                @apply-range-filter="setRangeFilter(column.key, $event.min, $event.max)"
                @reset-filter="resetFilter(column.key)"
              />
              <span v-else>{{ column.label }}</span>
            </th>
            <th v-if="showActions" class="py-2 text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>

        <tbody>
          <template v-if="loading">
            <tr v-for="n in SKELETON_ROWS" :key="`skeleton-${n}`" class="border-b last:border-b-0">
              <td v-for="column in visibleColumns" :key="column.key" class="py-3">
                <div class="h-3 w-full max-w-40 animate-pulse rounded bg-base-200" />
              </td>
              <td v-if="showActions" class="py-3">
                <div class="ml-auto h-3 w-12 animate-pulse rounded bg-base-200" />
              </td>
            </tr>
          </template>

          <tr
            v-for="(row, index) in loading ? [] : processedRows"
            :key="rowKeyOf(row, index)"
            class="border-b last:border-b-0 transition-colors"
            :class="canOpen(row) ? 'cursor-pointer hover:bg-base-50' : ''"
            @click="onRowClick(row, $event)"
          >
            <td
              v-for="column in visibleColumns"
              :key="column.key"
              class="py-2"
              :class="column.cellClass"
            >
              <slot :name="`cell-${column.key}`" :row="row">{{ cellText(column, row) }}</slot>
            </td>
            <td v-if="showActions" class="py-2 text-right">
              <div class="inline-flex items-center justify-end gap-3">
                <slot name="actions" :row="row">
                  <button
                    class="text-link-600 not-disabled:hover:underline disabled:opacity-40 disabled:cursor-not-allowed not-disabled:cursor-pointer"
                    :disabled="!canOpen(row)"
                    @click="$emit('row-open', row)"
                  >
                    {{ t('actions.open') }}
                  </button>
                </slot>
              </div>
            </td>
          </tr>

          <tr v-if="!loading && processedRows.length === 0">
            <td :colspan="visibleColumns.length + (showActions ? 1 : 0)">
              <CommonTableEmptyState
                :title="emptyState.title"
                :hint="emptyState.hint"
                :icon="emptyState.icon"
                :reset-label="emptyState.resetLabel"
                @reset="resetSearchAndFilters"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Compact mobile list -->
    <ul
      class="overflow-hidden rounded-xl border border-base-200 divide-y divide-base-200 bg-white"
      :class="{ 'xl:hidden': viewMode === 'table' }"
    >
      <template v-if="loading">
        <li v-for="n in SKELETON_ROWS" :key="`skeleton-${n}`" class="flex items-center gap-3 px-3 py-3">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-3 w-2/5 animate-pulse rounded bg-base-200" />
            <div class="h-2.5 w-3/5 animate-pulse rounded bg-base-100" />
          </div>
        </li>
      </template>

      <li v-for="(row, index) in loading ? [] : processedRows" :key="rowKeyOf(row, index)" class="flex items-stretch">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 bg-white px-3 py-2.5 text-left transition not-disabled:cursor-pointer not-disabled:hover:bg-base-50 disabled:cursor-default"
          :disabled="!canOpen(row)"
          @click="$emit('row-open', row)"
        >
          <div class="min-w-0 flex-1">
            <slot name="mobile-row" :row="row">
              <p class="truncate font-medium text-base-800">
                <slot name="mobile-title" :row="row">
                  <slot v-if="mobileTitleColumns.length === 1" :name="`cell-${mobileTitleColumns[0]!.key}`" :row="row">
                    {{ mobileTitle(row) }}
                  </slot>
                  <template v-else>{{ mobileTitle(row) }}</template>
                </slot>
              </p>
              <p
                v-if="mobileMetaColumns.length > 0 || $slots['mobile-meta']"
                class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-base-500"
              >
                <slot name="mobile-meta" :row="row">
                  <template v-for="(column, metaIndex) in mobileMetaColumns" :key="column.key">
                    <span class="inline-flex max-w-full items-baseline gap-1.5" :class="metaVisibilityClass(column)">
                      <span v-if="metaIndex > 0" class="text-base-300">·</span>
                      <span class="inline-flex max-w-full items-baseline gap-1">
                        <span v-if="column.mobileLabel" class="shrink-0 text-base-400">{{ column.label }}:</span>
                        <slot :name="`cell-${column.key}`" :row="row">
                          <span class="truncate">{{ cellText(column, row) }}</span>
                        </slot>
                      </span>
                    </span>
                  </template>
                </slot>
              </p>
            </slot>
          </div>
          <!-- A lock instead of the chevron: the row is legible, just not openable. -->
          <Icon
            :name="canOpen(row) ? 'material-symbols:chevron-right-rounded' : 'material-symbols:lock-outline'"
            class="shrink-0 text-xl"
            :class="canOpen(row) ? 'text-base-400' : 'text-base-300'"
          />
        </button>

        <MenuDropdown
          v-if="showActions && $slots.actions"
          v-model="actionMenuKey"
          :id="rowKeyOf(row, index)"
          wrapper-class="relative flex shrink-0 self-stretch"
        >
          <template #trigger>
            <button
              type="button"
              class="flex h-full w-full items-center justify-center border-l border-base-100 px-2.5 text-base-400 transition cursor-pointer hover:bg-base-50 hover:text-base-600"
              :aria-label="t('common.actions')"
            >
              <Icon name="material-symbols:more-vert" class="text-xl" />
            </button>
          </template>

          <template #default>
            <!--
              Action buttons come from the consumer's slot, so they are styled from the container.
              Matched by descendant (not child) so a consumer that groups its actions in a wrapper
              still gets one full-width row per action; `[&>div]:contents` dissolves that wrapper.
            -->
            <div
              class="flex min-w-40 flex-col [&>div]:contents [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:text-sm [&_button]:whitespace-nowrap [&_button]:transition [&_button]:hover:bg-base-100 [&_button]:hover:no-underline"
              @click="actionMenuKey = null"
            >
              <slot name="actions" :row="row" />
            </div>
          </template>
        </MenuDropdown>
      </li>

      <li v-if="!loading && processedRows.length === 0">
        <CommonTableEmptyState
          :title="emptyState.title"
          :hint="emptyState.hint"
          :icon="emptyState.icon"
          :reset-label="emptyState.resetLabel"
          @reset="resetSearchAndFilters"
        />
      </li>
    </ul>

    <!-- Mobile sort sheet -->
    <CommonModal v-model="sortOpen" :title="t('common.sort')">
      <ul class="divide-y divide-base-100">
        <li v-for="column in sortableColumns" :key="column.key">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 py-2.5 text-sm cursor-pointer"
            @click="toggleSort(column.key)"
          >
            <span :class="sortKey === column.key ? 'font-medium text-link-600' : 'text-base-700'">
              {{ column.label }}
            </span>
            <Icon :name="columnSortIcon(column.key)" class="text-lg" :class="sortKey === column.key ? 'text-link-600' : 'text-base-400'" />
          </button>
        </li>
      </ul>
      <template #footer>
        <button
          type="button"
          class="rounded-lg border border-base-300 px-3 py-2 text-sm text-base-600 transition not-disabled:cursor-pointer not-disabled:hover:bg-base-50 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!activeSortColumn"
          @click="resetSort"
        >
          {{ t('actions.reset') }}
        </button>
        <button type="button" class="btn-primary" @click="sortOpen = false">
          {{ t('actions.done') }}
        </button>
      </template>
    </CommonModal>

    <!-- Mobile filter sheet -->
    <CommonModal v-model="filterOpen" :title="t('common.filter')">
      <div class="divide-y divide-base-100">
        <div v-for="column in filterableColumns" :key="column.key">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 py-2.5 text-sm cursor-pointer"
            @click="expandedFilterKey = expandedFilterKey === column.key ? null : column.key"
          >
            <span class="flex min-w-0 flex-col items-start">
              <span class="inline-flex items-center gap-2 text-base-700">
                {{ column.label }}
                <span v-if="isFilterActive(column.key)" class="h-1.5 w-1.5 rounded-full bg-link-600" />
              </span>
              <span v-if="isFilterActive(column.key)" class="max-w-full truncate text-xs text-link-600">
                {{ filterSummary(column.key) }}
              </span>
            </span>
            <Icon
              :name="expandedFilterKey === column.key ? 'material-symbols:keyboard-arrow-up-rounded' : 'material-symbols:keyboard-arrow-down-rounded'"
              class="text-lg text-base-400"
            />
          </button>
          <div
            v-if="expandedFilterKey === column.key"
            class="mb-2 overflow-hidden rounded-lg border border-base-200"
          >
            <CommonTableFilterEditor
              :filter-type="column.filterType ?? 'text'"
              :filter="getFilter(column.key)"
              :text-options="textOptionsByColumn[column.key]"
              :number-bounds="numberBoundsByColumn[column.key] ?? null"
              @apply-text-filter="setTextFilter(column.key, $event); expandedFilterKey = null"
              @apply-range-filter="setRangeFilter(column.key, $event.min, $event.max); expandedFilterKey = null"
              @reset-filter="resetFilter(column.key); expandedFilterKey = null"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="rounded-lg border border-base-300 px-3 py-2 text-sm text-base-600 transition cursor-pointer hover:bg-base-50"
          @click="resetAllFilters"
        >
          {{ t('common.resetAllFilters') }}
        </button>
        <button type="button" class="btn-primary" @click="filterOpen = false">
          {{ t('actions.done') }}
        </button>
      </template>
    </CommonModal>

    <div
      v-if="!loading && totalCount > 0"
      class="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-base-600"
    >
      <span>{{ paginationSummary }}</span>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-base-500">{{ t('common.rowsPerPage') }}</span>
          <MenuDropdown v-model="pageSizeMenuOpen" id="pageSize" wrapper-class="relative">
            <template #trigger="{ styling }">
              <button type="button" :class="styling" class="w-auto! h-8 gap-1.5 px-2 cursor-pointer">
                {{ pageSize === 'all' ? t('common.all') : pageSize }}
                <Icon name="material-symbols:keyboard-arrow-down-rounded" class="text-lg text-base-400" />
              </button>
            </template>

            <template #default="{ styling }">
              <button
                v-for="option in ADVANCED_TABLE_PAGE_SIZE_OPTIONS"
                :key="option"
                type="button"
                :class="[styling, option === pageSize ? 'text-link-600 font-medium' : '']"
                @click="pageSize = option; pageSizeMenuOpen = null"
              >
                {{ option === 'all' ? t('common.all') : option }}
              </button>
            </template>
          </MenuDropdown>
        </div>

        <div v-if="totalPages > 1" class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 text-base-600 transition not-disabled:cursor-pointer not-disabled:hover:bg-base-50 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page <= 1"
            :aria-label="t('common.previousPage')"
            @click="page = page - 1"
          >
            <Icon name="material-symbols:chevron-left-rounded" class="text-xl" />
          </button>
          <span class="px-1 tabular-nums">{{ t('common.pageOfTotal', { page, total: totalPages }) }}</span>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 text-base-600 transition not-disabled:cursor-pointer not-disabled:hover:bg-base-50 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page >= totalPages"
            :aria-label="t('common.nextPage')"
            @click="page = page + 1"
          >
            <Icon name="material-symbols:chevron-right-rounded" class="text-xl" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, ref, toRef, watchEffect } from 'vue'
import { useI18n } from '~/composables/useI18n'
import {
  useAdvancedTable,
  useAdvancedTableViewMode,
  ADVANCED_TABLE_PAGE_SIZE_OPTIONS,
  type AdvancedTableColumn,
} from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  rows: T[]
  columns: AdvancedTableColumn<T>[]
  emptyText: string
  /** Replaces the rows with skeleton placeholders, so an in-flight load never reads as "no data". */
  loading?: boolean
  /** Icon for the empty state; defaults to a generic inbox. */
  emptyIcon?: string
  /** Unique key per row; defaults to `row.id`, falling back to the index. */
  rowKey?: (row: T) => string | number
  showActions?: boolean
  /** Gate for opening a row (disables the action button and the mobile row). */
  canOpenRow?: (row: T) => boolean
  tableClass?: string
  /** Unique, stable key to persist sort/filter/search state across page navigation. Omit to keep state local to this mount. */
  persistKey?: string
}>(), {
  loading: false,
  emptyIcon: 'material-symbols:inbox-rounded',
  showActions: true,
  tableClass: 'min-w-5xl',
})

const SKELETON_ROWS = 5
const FILTER_SUMMARY_VALUES = 2

const emit = defineEmits<{
  (e: 'row-open', row: T): void
}>()

defineSlots<{
  [key: `cell-${string}`]: (props: { row: T }) => any
  'mobile-row'?: (props: { row: T }) => any
  'mobile-title'?: (props: { row: T }) => any
  'mobile-meta'?: (props: { row: T }) => any
  'actions'?: (props: { row: T }) => any
}>()

const search = defineModel<string>('search', { default: '' })

const { t } = useI18n()
const { formatDate } = useLocaleFormatters()

const {
  sortKey,
  sortDirection,
  textOptionsByColumn,
  numberBoundsByColumn,
  globalSearchInput,
  page,
  pageSize,
  totalCount,
  totalPages,
  processedRows,
  getFilter,
  isFilterActive,
  toggleSort,
  setTextFilter,
  setRangeFilter,
  resetFilter,
} = useAdvancedTable<T, string>(toRef(props, 'rows'), props.columns, props.persistKey)

const pageSizeMenuOpen = ref<string | null>(null)

const paginationSummary = computed(() => {
  if (totalCount.value === 0) return ''
  const from = (page.value - 1) * (pageSize.value === 'all' ? totalCount.value : pageSize.value) + 1
  const to = pageSize.value === 'all' ? totalCount.value : Math.min(page.value * pageSize.value, totalCount.value)
  return t('common.paginationSummary', { from, to, total: totalCount.value })
})

// Seed the header search box from restored persisted state; afterwards the box drives it.
if (props.persistKey && globalSearchInput.value !== search.value) {
  search.value = globalSearchInput.value
}

watchEffect(() => {
  globalSearchInput.value = search.value
})

const sortOpen = ref(false)
const filterOpen = ref(false)
const expandedFilterKey = ref<string | null>(null)
const viewMode = useAdvancedTableViewMode(props.persistKey)

const actionMenuKey = ref<string | number | null>(null)

const visibleColumns = computed(() => props.columns.filter(column => column.hidden !== true))
const sortableColumns = computed(() => visibleColumns.value.filter(column => column.sortable !== false))
const filterableColumns = computed(() => visibleColumns.value.filter(column => column.filterable !== false))
const activeFilterColumns = computed(() => filterableColumns.value.filter(column => isFilterActive(column.key)))
const mobileTitleColumns = computed(() => {
  const titleColumns = visibleColumns.value.filter(column => column.mobile === 'title')
  if (titleColumns.length > 0) return titleColumns
  return visibleColumns.value.slice(0, 1)
})
const mobileMetaColumns = computed(() => {
  return visibleColumns.value.filter(column => (column.mobile ?? 'meta') === 'meta' && !mobileTitleColumns.value.includes(column))
})
const activeSortColumn = computed(() => {
  if (!sortKey.value || !sortDirection.value) return null
  return visibleColumns.value.find(column => column.key === sortKey.value) ?? null
})
const sortDirectionIcon = computed(() => {
  return sortDirection.value === 'desc'
    ? 'material-symbols:arrow-downward-rounded'
    : 'material-symbols:arrow-upward-rounded'
})

function rowKeyOf(row: T, index: number): string | number {
  if (props.rowKey) return props.rowKey(row)
  const id = (row as { id?: string | number }).id
  return id ?? index
}

function canOpen(row: T): boolean {
  return props.canOpenRow ? props.canOpenRow(row) : true
}

function cellText(column: AdvancedTableColumn<T>, row: T): string {
  if (column.format) return column.format(row)
  const value = column.getValue(row)
  if (value === null || value === undefined || value === '') return t('common.notAvailable')
  return String(value)
}

function mobileTitle(row: T): string {
  return mobileTitleColumns.value.map(column => cellText(column, row)).join(' ')
}

function metaVisibilityClass(column: AdvancedTableColumn<T>): string {
  if (column.mobileMinBreakpoint === 'lg') return 'hidden lg:inline-flex'
  return ''
}

function columnSortIcon(key: string): string {
  if (sortKey.value !== key || !sortDirection.value) return 'material-symbols:unfold-more-rounded'
  return sortDirection.value === 'asc'
    ? 'material-symbols:arrow-upward-rounded'
    : 'material-symbols:arrow-downward-rounded'
}

function filterSummary(key: string): string {
  const filter = getFilter(key)
  if (filter.type === 'text') {
    if (filter.selected.length <= FILTER_SUMMARY_VALUES) return filter.selected.join(', ')
    return t('common.filterSummaryMore', {
      values: filter.selected.slice(0, FILTER_SUMMARY_VALUES).join(', '),
      count: filter.selected.length - FILTER_SUMMARY_VALUES,
    })
  }

  const min = filter.min === '' ? t('common.openEnded') : formatRangeBound(filter.type, filter.min)
  const max = filter.max === '' ? t('common.openEnded') : formatRangeBound(filter.type, filter.max)
  return `${min} – ${max}`
}

function formatRangeBound(type: 'number' | 'date', value: string): string {
  if (type !== 'date') return value
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? formatDate(value) : value
}

function resetAllFilters() {
  for (const column of filterableColumns.value) {
    resetFilter(column.key)
  }
  expandedFilterKey.value = null
}

function resetSort() {
  sortKey.value = null
  sortDirection.value = null
}

const isNarrowed = computed(() => search.value.trim().length > 0 || activeFilterColumns.value.length > 0)

const emptyState = computed(() => {
  if (isNarrowed.value) {
    return {
      title: t('common.noResults'),
      hint: t('common.noResultsHint'),
      icon: 'material-symbols:search-off-rounded',
      resetLabel: t('common.resetSearchAndFilters'),
    }
  }

  return { title: props.emptyText, hint: '', icon: props.emptyIcon, resetLabel: '' }
})

function resetSearchAndFilters() {
  search.value = ''
  resetAllFilters()
}

function onRowClick(row: T, event: MouseEvent) {
  if (!canOpen(row)) return

  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, input, select, textarea, label, [role="button"]')) return

  if (window.getSelection()?.toString()) return

  emit('row-open', row)
}
</script>
