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
        class="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm transition cursor-pointer hover:bg-slate-50"
        :class="activeSortColumn ? 'border-blue-500 text-blue-600' : 'border-slate-300 text-slate-600'"
        @click="sortOpen = true"
      >
        <Icon name="material-symbols:swap-vert-rounded" class="text-base" />
        <span>{{ activeSortColumn ? activeSortColumn.label : t('common.sort') }}</span>
        <Icon v-if="activeSortColumn" :name="sortDirectionIcon" class="text-base" />
      </button>

      <button
        v-if="filterableColumns.length > 0"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm transition cursor-pointer hover:bg-slate-50"
        :class="activeFilterColumns.length > 0 ? 'border-blue-500 text-blue-600' : 'border-slate-300 text-slate-600'"
        @click="filterOpen = true"
      >
        <Icon name="material-symbols:filter-list-rounded" class="text-base" />
        <span>{{ t('common.filter') }}</span>
        <span
          v-if="activeFilterColumns.length > 0"
          class="rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white"
        >
          {{ activeFilterColumns.length }}
        </span>
      </button>

      <button
        v-for="column in activeFilterColumns"
        :key="column.key"
        type="button"
        class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition cursor-pointer hover:bg-blue-100"
        @click="resetFilter(column.key)"
      >
        {{ column.label }}
        <Icon name="material-symbols:close-rounded" class="text-sm" />
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
          <tr
            v-for="(row, index) in processedRows"
            :key="rowKeyOf(row, index)"
            class="border-b last:border-b-0 transition"
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
                    class="text-blue-600 not-disabled:hover:underline disabled:opacity-40 disabled:cursor-not-allowed not-disabled:cursor-pointer"
                    :disabled="!canOpen(row)"
                    @click="$emit('row-open', row)"
                  >
                    {{ t('actions.open') }}
                  </button>
                </slot>
              </div>
            </td>
          </tr>

          <tr v-if="processedRows.length === 0">
            <td :colspan="visibleColumns.length + (showActions ? 1 : 0)" class="py-6 text-center text-slate-500">
              {{ emptyText }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Compact mobile list -->
    <ul
      class="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-200 bg-white"
      :class="{ 'xl:hidden': viewMode === 'table' }"
    >
      <li v-for="(row, index) in processedRows" :key="rowKeyOf(row, index)" class="flex items-stretch">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 bg-white px-3 py-2.5 text-left transition not-disabled:cursor-pointer not-disabled:hover:bg-slate-50 disabled:cursor-default"
          :disabled="!canOpen(row)"
          @click="$emit('row-open', row)"
        >
          <div class="min-w-0 flex-1">
            <slot name="mobile-row" :row="row">
              <p class="truncate font-medium text-slate-800">
                <slot name="mobile-title" :row="row">
                  <slot v-if="mobileTitleColumns.length === 1" :name="`cell-${mobileTitleColumns[0]!.key}`" :row="row">
                    {{ mobileTitle(row) }}
                  </slot>
                  <template v-else>{{ mobileTitle(row) }}</template>
                </slot>
              </p>
              <p
                v-if="mobileMetaColumns.length > 0 || $slots['mobile-meta']"
                class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-slate-500"
              >
                <slot name="mobile-meta" :row="row">
                  <template v-for="(column, metaIndex) in mobileMetaColumns" :key="column.key">
                    <span class="inline-flex max-w-full items-baseline gap-1.5" :class="metaVisibilityClass(column)">
                      <span v-if="metaIndex > 0" class="text-slate-300">·</span>
                      <span class="inline-flex max-w-full items-baseline gap-1">
                        <span v-if="column.mobileLabel" class="shrink-0 text-slate-400">{{ column.label }}:</span>
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
            :class="canOpen(row) ? 'text-slate-400' : 'text-slate-300'"
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
              class="flex h-full w-full items-center justify-center border-l border-slate-100 px-2.5 text-slate-400 transition cursor-pointer hover:bg-slate-50 hover:text-slate-600"
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
              class="flex min-w-40 flex-col [&>div]:contents [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:text-sm [&_button]:whitespace-nowrap [&_button]:transition [&_button]:hover:bg-slate-100 [&_button]:hover:no-underline"
              @click="actionMenuKey = null"
            >
              <slot name="actions" :row="row" />
            </div>
          </template>
        </MenuDropdown>
      </li>

      <li v-if="processedRows.length === 0" class="py-6 text-center text-sm text-slate-500">
        {{ emptyText }}
      </li>
    </ul>

    <!-- Mobile sort sheet -->
    <CommonModal v-model="sortOpen" :title="t('common.sort')">
      <ul class="divide-y divide-slate-100">
        <li v-for="column in sortableColumns" :key="column.key">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 py-2.5 text-sm cursor-pointer"
            @click="toggleSort(column.key)"
          >
            <span :class="sortKey === column.key ? 'font-medium text-blue-600' : 'text-slate-700'">
              {{ column.label }}
            </span>
            <Icon :name="columnSortIcon(column.key)" class="text-lg" :class="sortKey === column.key ? 'text-blue-600' : 'text-slate-400'" />
          </button>
        </li>
      </ul>
      <template #footer>
        <button type="button" class="btn-primary" @click="sortOpen = false">
          {{ t('actions.done') }}
        </button>
      </template>
    </CommonModal>

    <!-- Mobile filter sheet -->
    <CommonModal v-model="filterOpen" :title="t('common.filter')">
      <div class="divide-y divide-slate-100">
        <div v-for="column in filterableColumns" :key="column.key">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 py-2.5 text-sm cursor-pointer"
            @click="expandedFilterKey = expandedFilterKey === column.key ? null : column.key"
          >
            <span class="inline-flex items-center gap-2 text-slate-700">
              {{ column.label }}
              <span v-if="isFilterActive(column.key)" class="h-1.5 w-1.5 rounded-full bg-blue-600" />
            </span>
            <Icon
              :name="expandedFilterKey === column.key ? 'material-symbols:keyboard-arrow-up-rounded' : 'material-symbols:keyboard-arrow-down-rounded'"
              class="text-lg text-slate-400"
            />
          </button>
          <div
            v-if="expandedFilterKey === column.key"
            class="mb-2 overflow-hidden rounded-lg border border-slate-200"
          >
            <CommonTableFilterEditor
              :filter-type="column.filterType ?? 'text'"
              :filter="getFilter(column.key)"
              :text-options="textOptionsByColumn[column.key]"
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
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition cursor-pointer hover:bg-slate-50"
          @click="resetAllFilters"
        >
          {{ t('common.resetAllFilters') }}
        </button>
        <button type="button" class="btn-primary" @click="filterOpen = false">
          {{ t('actions.done') }}
        </button>
      </template>
    </CommonModal>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, ref, toRef, watchEffect } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useAdvancedTable, useAdvancedTableViewMode, type AdvancedTableColumn } from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  rows: T[]
  columns: AdvancedTableColumn<T>[]
  emptyText: string
  /** Unique key per row; defaults to `row.id`, falling back to the index. */
  rowKey?: (row: T) => string | number
  showActions?: boolean
  /** Gate for opening a row (disables the action button and the mobile row). */
  canOpenRow?: (row: T) => boolean
  tableClass?: string
  /** Unique, stable key to persist sort/filter/search state across page navigation. Omit to keep state local to this mount. */
  persistKey?: string
}>(), {
  showActions: true,
  tableClass: 'min-w-5xl',
})

defineEmits<{
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

const {
  sortKey,
  sortDirection,
  textOptionsByColumn,
  globalSearchInput,
  processedRows,
  getFilter,
  isFilterActive,
  toggleSort,
  setTextFilter,
  setRangeFilter,
  resetFilter,
} = useAdvancedTable<T, string>(toRef(props, 'rows'), props.columns, props.persistKey)

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

function resetAllFilters() {
  for (const column of filterableColumns.value) {
    resetFilter(column.key)
  }
  expandedFilterKey.value = null
}
</script>
