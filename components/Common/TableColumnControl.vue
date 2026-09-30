<template>
  <div class="inline-flex items-center gap-1 relative">
    <button
      type="button"
      class="inline-flex items-center gap-1 hover:text-link-700 cursor-pointer"
      @click="$emit('toggle-sort')"
    >
      <span>{{ label }}</span>
      <Icon :name="sortIcon" class="w-4 h-4" :class="sortDirection ? 'text-link-600' : 'text-base-400'" />
    </button>

    <button
      v-if="filterable"
      ref="triggerRef"
      type="button"
      class="inline-flex items-center gap-1 rounded-lg border p-1 transition cursor-pointer"
      :class="isFilterActive
        ? 'border-link-500 bg-link-50 text-link-700 hover:bg-link-100'
        : 'border-base-300 text-base-500 hover:bg-base-50 hover:text-base-700'"
      :title="filterButtonTitle"
      :aria-label="filterButtonTitle"
      aria-haspopup="dialog"
      :aria-expanded="menuOpen"
      @click.stop="toggleMenu"
    >
      <Icon name="material-symbols:filter-list-rounded" class="w-4 h-4" />
      <span v-if="activeCount > 1" class="pr-0.5 text-[10px] font-semibold leading-none tabular-nums">
        {{ activeCount }}
      </span>
    </button>

    <Teleport defer to="#page-root">
      <div
        v-if="filterable && menuOpen"
        ref="menuRef"
        role="dialog"
        :aria-label="filterButtonTitle"
        class="fixed z-100 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-base-200 bg-white shadow-xl ring-1 ring-base-900/5 overflow-hidden"
        :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
        @click.stop
      >
        <div class="flex items-center justify-between gap-2 border-b border-base-200 px-2.5 py-2">
          <p class="min-w-0 truncate text-xs font-semibold text-base-700">{{ label }}</p>
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base-400 transition cursor-pointer hover:bg-base-100 hover:text-base-600"
            :aria-label="t('actions.close')"
            @click="menuOpen = false"
          >
            <Icon name="material-symbols:close-rounded" class="h-4 w-4" />
          </button>
        </div>

        <CommonTableFilterEditor
          :filter-type="filterType"
          :filter="filter"
          :text-options="textOptions"
          :number-bounds="numberBounds"
          autofocus
          @apply-text-filter="onApplyTextFilter"
          @apply-range-filter="onApplyRangeFilter"
          @reset-filter="onResetFilter"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '~/composables/useI18n'
import type { ColumnFilter, SortDirection, TableFilterType, TextFilterOption } from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  label: string
  sortDirection: SortDirection
  filterType?: TableFilterType
  isFilterActive?: boolean
  filter?: ColumnFilter
  filterable?: boolean
  textOptions?: TextFilterOption[]
  numberBounds?: { min: number, max: number } | null
}>(), {
  filterType: 'text',
  isFilterActive: false,
  filter: () => ({ type: 'text', selected: [] }),
  filterable: true,
  numberBounds: null,
})

const emit = defineEmits<{
  (e: 'toggle-sort'): void
  (e: 'apply-text-filter', values: string[]): void
  (e: 'apply-range-filter', payload: { min: string, max: string }): void
  (e: 'reset-filter'): void
}>()

const { t } = useI18n()

const menuOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuPosition = ref({ top: 0, left: 0 })

const sortIcon = computed(() => {
  if (props.sortDirection === 'asc') return 'material-symbols:arrow-upward-rounded'
  if (props.sortDirection === 'desc') return 'material-symbols:arrow-downward-rounded'
  return 'material-symbols:unfold-more-rounded'
})

const activeCount = computed(() => {
  if (!props.isFilterActive) return 0
  return props.filter.type === 'text' ? props.filter.selected.length : 1
})

const filterButtonTitle = computed(() => {
  return props.isFilterActive
    ? `${t('common.filter')}: ${props.label} — ${t('common.filterActive')}`
    : `${t('common.filter')}: ${props.label}`
})

async function setMenuPosition() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu) return

  const triggerRect = trigger.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const viewportPadding = 8
  const spacing = 6

  let left = triggerRect.left
  if (left + menuRect.width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - menuRect.width - viewportPadding
  }
  if (left < viewportPadding) left = viewportPadding

  let top = triggerRect.bottom + spacing
  if (top + menuRect.height > window.innerHeight - viewportPadding) {
    top = triggerRect.top - menuRect.height - spacing
  }
  if (top < viewportPadding) top = viewportPadding

  menuPosition.value = { top, left }
}

function onDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return

  const target = event.target as Node | null
  if (!target) return

  const isInsideMenu = menuRef.value?.contains(target) ?? false
  const isInsideTrigger = triggerRef.value?.contains(target) ?? false
  if (!isInsideMenu && !isInsideTrigger) {
    menuOpen.value = false
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || event.key !== 'Escape') return
  event.stopPropagation()
  menuOpen.value = false
  triggerRef.value?.focus()
}

function onWindowChange() {
  if (!menuOpen.value) return
  setMenuPosition()
}

async function toggleMenu() {
  if (!props.filterable) return
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) return
  await nextTick()
  setMenuPosition()
}

function onApplyTextFilter(values: string[]) {
  emit('apply-text-filter', values)
  menuOpen.value = false
}

function onApplyRangeFilter(payload: { min: string, max: string }) {
  emit('apply-range-filter', payload)
  menuOpen.value = false
}

function onResetFilter() {
  emit('reset-filter')
  menuOpen.value = false
}

watch(menuOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('keydown', onDocumentKeydown, true)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  } else {
    document.removeEventListener('click', onDocumentClick, true)
    document.removeEventListener('keydown', onDocumentKeydown, true)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('keydown', onDocumentKeydown, true)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>
