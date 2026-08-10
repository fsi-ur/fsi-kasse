<template>
  <div class="inline-flex items-center gap-1 relative">
    <button
      type="button"
      class="inline-flex items-center gap-1 hover:text-blue-700 cursor-pointer"
      @click="$emit('toggle-sort')"
    >
      <span>{{ label }}</span>
      <Icon :name="sortIcon" class="w-4 h-4" />
    </button>

    <button
      v-if="filterable"
      ref="triggerRef"
      type="button"
      class="pt-1 pr-1 pl-1 rounded-lg border hover:bg-slate-50 cursor-pointer"
      :class="isFilterActive ? 'border-blue-500 text-blue-600' : 'border-slate-300 text-slate-500'"
      @click.stop="toggleMenu"
    >
      <Icon name="material-symbols:filter-list-rounded" class="w-4 h-4" />
    </button>

    <Teleport defer to="#page-root">
      <div
        v-if="filterable && menuOpen"
        ref="menuRef"
        class="fixed z-100 w-72 rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 overflow-hidden"
        :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
        @click.stop
      >
        <CommonTableFilterEditor
          :filter-type="filterType"
          :filter="filter"
          :text-options="textOptions"
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
import type { ColumnFilter, SortDirection, TableFilterType } from '~/composables/useAdvancedTable'

const props = withDefaults(defineProps<{
  label: string
  sortDirection: SortDirection
  filterType?: TableFilterType
  isFilterActive?: boolean
  filter?: ColumnFilter
  filterable?: boolean
  textOptions?: string[]
}>(), {
  filterType: 'text',
  isFilterActive: false,
  filter: () => ({ type: 'text', selected: [] }),
  filterable: true,
})

const emit = defineEmits<{
  (e: 'toggle-sort'): void
  (e: 'apply-text-filter', values: string[]): void
  (e: 'apply-range-filter', payload: { min: string, max: string }): void
  (e: 'reset-filter'): void
}>()

const menuOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuPosition = ref({ top: 0, left: 0 })

const sortIcon = computed(() => {
  if (props.sortDirection === 'asc') return 'material-symbols:arrow-upward-rounded'
  if (props.sortDirection === 'desc') return 'material-symbols:arrow-downward-rounded'
  return 'material-symbols:unfold-more-rounded'
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
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  } else {
    document.removeEventListener('click', onDocumentClick, true)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>
