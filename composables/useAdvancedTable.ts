import { computed, ref, watch, type Ref } from 'vue'

export type SortDirection = 'asc' | 'desc' | null
export type TableFilterType = 'text' | 'number' | 'date'

export interface TableColumnConfig<T, K extends string = string> {
  key: K
  filterType?: TableFilterType
  getValue: (row: T) => unknown
  sortable?: boolean
  filterable?: boolean
  globalSearchable?: boolean
}

export interface AdvancedTableColumn<T, K extends string = string> extends TableColumnConfig<T, K> {
  label: string
  /** Display text for a cell; defaults to String(getValue(row)) with '-' for empty values. */
  format?: (row: T) => string
  headerClass?: string
  cellClass?: string
  /** Reactively hide the column entirely (e.g. permission-gated columns). */
  hidden?: boolean
  /** Placement in the compact mobile row: part of the bold title line, the meta line (default), or omitted. */
  mobile?: 'title' | 'meta' | 'hidden'
  /** Prefix the value with the column label in the mobile meta line (for values that are ambiguous on their own). */
  mobileLabel?: boolean
  /** Only show this meta-line entry from this breakpoint up (e.g. 'lg' hides it on phones but keeps it on the tablet-width compact view). */
  mobileMinBreakpoint?: 'lg'
}

export interface TextColumnFilter {
  type: 'text'
  selected: string[]
}

export interface RangeColumnFilter {
  type: 'number' | 'date'
  min: string
  max: string
}

export type ColumnFilter = TextColumnFilter | RangeColumnFilter

export interface TextFilterOption {
  value: string
  count: number
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLocaleLowerCase('de-DE')
}

function toComparableValue(type: TableFilterType, value: unknown): number | string | null {
  if (value === null || value === undefined || value === '') return null

  if (type === 'number') {
    const raw = String(value).trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '')
    const lastComma = raw.lastIndexOf(',')
    const lastDot = raw.lastIndexOf('.')
    let normalized = raw

    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        normalized = raw.replace(/\./g, '').replace(',', '.')
      } else {
        normalized = raw.replace(/,/g, '')
      }
    } else if (lastComma > -1) {
      normalized = raw.replace(',', '.')
    }

    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : null
  }

  if (type === 'date') {
    const ts = Date.parse(String(value))
    return Number.isFinite(ts) ? ts : null
  }

  return normalizeText(value)
}

function toDateSearchTokens(value: unknown): string[] {
  if (!value) return []
  const raw = String(value)
  // Treat bare DB strings (no timezone marker) as UTC
  const utcStr = (!/[Z+\-]\d{2}:?\d{2}$/.test(raw) && !raw.endsWith('Z'))
    ? raw.replace(' ', 'T') + 'Z'
    : raw
  const ts = Date.parse(utcStr)
  if (!Number.isFinite(ts)) return [normalizeText(raw)]
  return [
    normalizeText(raw),
    normalizeText(
      new Date(ts).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      }),
    ),
  ]
}

function defaultFilters<T, K extends string>(columns: TableColumnConfig<T, K>[]): Record<string, ColumnFilter> {
  return columns.reduce<Record<string, ColumnFilter>>((acc, column) => {
    const filterType = column.filterType ?? 'text'
    if (filterType === 'text') {
      acc[column.key] = { type: 'text', selected: [] }
    } else {
      acc[column.key] = { type: filterType, min: '', max: '' }
    }
    return acc
  }, {})
}

export type AdvancedTableViewMode = 'table' | 'compact'
export type AdvancedTablePageSize = 10 | 25 | 50 | 100 | 'all'

export const ADVANCED_TABLE_PAGE_SIZE_OPTIONS: AdvancedTablePageSize[] = [10, 25, 50, 100, 'all']
const DEFAULT_PAGE_SIZE: AdvancedTablePageSize = 25

export function useAdvancedTablePageSize() {
  return useState<AdvancedTablePageSize>('table:pageSize', () => DEFAULT_PAGE_SIZE)
}

/**
 * Shared between `CommonAdvancedTable` and `CommonAdvancedTableViewToggle`, which usually live in
 * different parent components (the toggle sits in the search-bar row above the table) — keying
 * both by the same `persistKey` via `useState` keeps them in sync without prop/event plumbing.
 */
export function useAdvancedTableViewMode(persistKey?: string) {
  return persistKey
    ? useState<AdvancedTableViewMode>(`table:${persistKey}:viewMode`, () => 'compact')
    : ref<AdvancedTableViewMode>('compact')
}

/**
 * Optional `persistKey` backs sort/filter/search state with `useState` (instead of a plain `ref`)
 * so it survives the component remounts caused by SPA page navigation (see PageRenderer).
 * Give each table usage a unique, stable key.
 */
export function useAdvancedTable<T, K extends string>(
  rows: Readonly<Ref<T[]>>,
  columns: TableColumnConfig<T, K>[],
  persistKey?: string,
) {
  const sortKey = persistKey ? useState<K | null>(`table:${persistKey}:sortKey`, () => null) : ref<K | null>(null)
  const sortDirection = persistKey ? useState<SortDirection>(`table:${persistKey}:sortDirection`, () => null) : ref<SortDirection>(null)
  const globalSearchInput = persistKey ? useState<string>(`table:${persistKey}:search`, () => '') : ref('')
  const globalSearchTerm = ref('')
  const pageSize = useAdvancedTablePageSize()
  const page = persistKey ? useState<number>(`table:${persistKey}:page`, () => 1) : ref(1)

  const columnByKey = computed(() => {
    return columns.reduce<Record<string, TableColumnConfig<T, K>>>((acc, column) => {
      acc[column.key] = column
      return acc
    }, {})
  })

  const filters = persistKey
    ? useState<Record<string, ColumnFilter>>(`table:${persistKey}:filters`, () => defaultFilters(columns))
    : ref<Record<string, ColumnFilter>>(defaultFilters(columns))

  const textOptionsByColumn = computed<Record<string, TextFilterOption[]>>(() => {
    const result: Record<string, TextFilterOption[]> = {}
    for (const column of columns) {
      if (column.filterable === false || (column.filterType ?? 'text') !== 'text') continue
      const counts = new Map<string, number>()
      for (const row of rows.value) {
        const value = column.getValue(row)
        const text = value === null || value === undefined || value === '' ? '-' : String(value)
        counts.set(text, (counts.get(text) ?? 0) + 1)
      }
      result[column.key] = Array.from(counts, ([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'de-DE'))
    }
    return result
  })

  const numberBoundsByColumn = computed<Record<string, { min: number, max: number } | null>>(() => {
    const result: Record<string, { min: number, max: number } | null> = {}
    for (const column of columns) {
      if (column.filterable === false || column.filterType !== 'number') continue
      let min: number | null = null
      let max: number | null = null
      for (const row of rows.value) {
        const comparable = toComparableValue('number', column.getValue(row))
        if (typeof comparable !== 'number') continue
        if (min === null || comparable < min) min = comparable
        if (max === null || comparable > max) max = comparable
      }
      result[column.key] = min === null || max === null ? null : { min, max }
    }
    return result
  })

  function getFilter(key: K): ColumnFilter {
    return filters.value[key]!
  }

  function isFilterActive(key: K): boolean {
    const filter = filters.value[key]
    if (!filter) return false
    if (filter.type === 'text') return filter.selected.length > 0
    return filter.min !== '' || filter.max !== ''
  }

  function setTextFilter(key: K, selected: string[]) {
    filters.value[key] = {
      type: 'text',
      selected: Array.from(new Set(selected)),
    }
  }

  function setRangeFilter(key: K, min: string, max: string) {
    const column = columnByKey.value[key]
    const type = column?.filterType === 'date' ? 'date' : 'number'
    filters.value[key] = {
      type,
      min: min.trim(),
      max: max.trim(),
    }
  }

  function resetFilter(key: K) {
    const column = columnByKey.value[key]
    if (!column) return
    const filterType = column.filterType ?? 'text'
    if (filterType === 'text') {
      filters.value[key] = { type: 'text', selected: [] }
    } else {
      filters.value[key] = {
        type: filterType,
        min: '',
        max: '',
      }
    }
  }

  function toggleSort(key: K) {
    const column = columnByKey.value[key]
    if (!column || column.sortable === false) return

    if (sortKey.value !== key) {
      sortKey.value = key
      sortDirection.value = 'asc'
      return
    }

    if (sortDirection.value === 'asc') {
      sortDirection.value = 'desc'
      return
    }

    sortKey.value = null
    sortDirection.value = null
  }

  watch(globalSearchInput, (value) => {
    globalSearchTerm.value = value.trim()
  })

  const sortedRows = computed<T[]>(() => {
    const filtered = rows.value.filter((row) => {
      for (const column of columns) {
        if (column.filterable === false) continue

        const filter = filters.value[column.key]
        const value = column.getValue(row)

        if (filter?.type === 'text' && filter.selected.length > 0) {
          const normalizedValue = normalizeText(value === null || value === undefined || value === '' ? '-' : String(value))
          const selected = new Set(filter.selected.map(item => normalizeText(item)))
          if (!selected.has(normalizedValue)) return false
        }

        if (filter?.type === 'number' || filter?.type === 'date') {
          if (filter.min === '' && filter.max === '') continue

          const comparable = toComparableValue(filter.type, value)
          if (comparable === null || typeof comparable === 'string') return false

          const minComparable = filter.min === '' ? null : toComparableValue(filter.type, filter.min)
          const maxComparable = filter.max === '' ? null : toComparableValue(filter.type, filter.max)

          if (typeof minComparable === 'number' && comparable < minComparable) return false
          if (typeof maxComparable === 'number' && comparable > maxComparable) return false
        }
      }

      const searchTerm = normalizeText(globalSearchTerm.value)
      if (!searchTerm) return true

      return columns.some((column) => {
        if (!column.globalSearchable) return false
        const raw = column.getValue(row)
        if (column.filterType === 'date') {
          return toDateSearchTokens(raw).some(token => token.includes(searchTerm))
        }
        return normalizeText(raw).includes(searchTerm)
      })
    })

    const sorted = [...filtered]
    if (!sortKey.value || !sortDirection.value) return sorted

    const activeColumn = columnByKey.value[sortKey.value]
    if (!activeColumn) return sorted

    const factor = sortDirection.value === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      const filterType = activeColumn.filterType ?? 'text'
      const left = toComparableValue(filterType, activeColumn.getValue(a))
      const right = toComparableValue(filterType, activeColumn.getValue(b))

      if (left === null && right === null) return 0
      if (left === null) return 1
      if (right === null) return -1

      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor
      }

      return String(left).localeCompare(String(right), 'de-DE') * factor
    })

    return sorted
  })

  const totalCount = computed(() => sortedRows.value.length)

  const totalPages = computed(() => {
    if (pageSize.value === 'all') return 1
    return Math.max(1, Math.ceil(totalCount.value / pageSize.value))
  })

  watch([filters, globalSearchTerm, pageSize], () => {
    page.value = 1
  }, { deep: true })

  watch([totalPages, page], ([currentTotalPages, currentPage]) => {
    if (currentPage > currentTotalPages) page.value = currentTotalPages
    else if (currentPage < 1) page.value = 1
  })

  const processedRows = computed<T[]>(() => {
    if (pageSize.value === 'all') return sortedRows.value
    const start = (page.value - 1) * pageSize.value
    return sortedRows.value.slice(start, start + pageSize.value)
  })

  return {
    sortKey,
    sortDirection,
    filters,
    textOptionsByColumn,
    numberBoundsByColumn,
    globalSearchInput,
    globalSearchTerm,
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
  }
}
