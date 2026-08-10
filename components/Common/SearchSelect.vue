<template>
  <div ref="rootRef" class="relative w-full">
    <div class="flex items-center gap-2">
      <input
        :value="currentQuery"
        :placeholder="placeholder"
        :disabled="disabled"
        class="input w-full"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
      >

      <slot name="after-trigger" />
    </div>

    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="open"
          ref="menuRef"
          class="search-select-menu absolute z-70 rounded-lg border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-900/5 w-max overflow-y-auto"
          :class="menuWidthClass"
          :style="menuStyle"
        >
          <button
            v-if="showCreateOption"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-slate-100 rounded-md cursor-pointer whitespace-nowrap"
            @click="onCreate"
          >
            <span v-if="!hideCreateQuery">"{{ currentQuery }}"</span>
            <span class="text-orange-500 font-semibold">{{ createActionLabel }}</span>
          </button>

          <div v-if="showCreateOption" class="my-1 border-t border-slate-200" />

          <button
            v-for="option in filteredOptions"
            :key="option.key"
            type="button"
            class="flex w-full items-center gap-2 text-left px-3 py-2 text-sm transition hover:bg-slate-100 rounded-md cursor-pointer whitespace-nowrap"
            :class="optionClass"
            @click="selectOption(option)"
          >
            <span class="overflow-hidden text-ellipsis">{{ option.label }}</span>
          </button>

          <div v-if="filteredOptions.length === 0" class="px-3 py-2 text-sm text-slate-500">
            {{ emptyText }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

export interface SearchSelectOption<T = unknown> {
  key: string | number
  label: string
  value: T
  searchText?: string
}

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  options: {
    type: Array as PropType<SearchSelectOption[]>,
    required: true,
  },
  placeholder: {
    type: String,
    default: '',
  },
  emptyText: {
    type: String,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  menuWidth: {
    type: String as PropType<'default' | 'wide'>,
    default: 'default',
  },
  selectedLabel: {
    type: String,
    default: '',
  },
  allowCreate: {
    type: Boolean,
    default: false,
  },
  createActionLabel: {
    type: String,
    default: '',
  },
  hideCreateQuery: {
    type: Boolean,
    default: false,
  },
  optionClass: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', value: unknown): void
  (e: 'create'): void
  (e: 'clear-selection'): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const open = ref(false)
const menuStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
  minWidth: '0px',
  maxHeight: '12.5rem',
})
let positionFrame: number | null = null

const currentQuery = computed(() => props.modelValue || props.selectedLabel || '')
const normalizedQuery = computed(() => (props.modelValue || '').trim().toLowerCase())
const filteredOptions = computed(() => {
  if (!normalizedQuery.value) return props.options

  return props.options.filter((option) => {
    const searchable = `${option.label} ${option.searchText || ''}`.toLowerCase()
    return searchable.includes(normalizedQuery.value)
  })
})
const showCreateOption = computed(() => props.allowCreate && (props.hideCreateQuery || currentQuery.value.trim().length > 0))
const menuWidthClass = computed(() => props.menuWidth === 'wide' ? 'w-full max-w-[48rem]' : 'max-w-[min(30rem,calc(100vw-2rem))]')

function updateMenuPosition() {
  if (!open.value || !rootRef.value) return

  const viewportPadding = 16
  const menuGap = 4
  const preferredMaxHeight = 200
  const rootRect = rootRef.value.getBoundingClientRect()
  const menuElement = menuRef.value
  const menuRect = menuElement?.getBoundingClientRect()
  const viewport = window.visualViewport
  const viewportLeft = viewport?.offsetLeft ?? 0
  const viewportTop = viewport?.offsetTop ?? 0
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const topBoundary = viewportTop + viewportPadding
  const bottomBoundary = viewportTop + viewportHeight - viewportPadding
  const spaceBelow = bottomBoundary - rootRect.bottom
  const spaceAbove = rootRect.top - topBoundary
  const desiredMenuHeight = Math.min(menuElement?.scrollHeight ?? preferredMaxHeight, preferredMaxHeight)
  const shouldOpenUp = spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow
  const availableSpace = Math.max((shouldOpenUp ? spaceAbove : spaceBelow) - menuGap, 0)
  const menuMaxHeight = Math.max(Math.min(preferredMaxHeight, availableSpace), 0)
  const actualMenuHeight = Math.min(menuElement?.scrollHeight ?? desiredMenuHeight, menuMaxHeight || desiredMenuHeight)
  const measuredWidth = menuRect?.width ?? Math.max(rootRect.width, menuElement?.scrollWidth ?? 0)
  const minLeft = viewportLeft + viewportPadding
  const maxLeft = viewportLeft + viewportWidth - viewportPadding - measuredWidth
  const left = Math.min(Math.max(rootRect.left, minLeft), Math.max(minLeft, maxLeft))
  const top = shouldOpenUp
    ? Math.max(topBoundary, rootRect.top - actualMenuHeight - menuGap)
    : Math.min(bottomBoundary, rootRect.bottom + menuGap)

  // Anchored with `position: absolute` (document coordinates), not `fixed`
  // (viewport coordinates) - iOS Safari misplaces `fixed` elements while the
  // on-screen keyboard is showing. `absolute` also scrolls natively with the
  // page for free, instead of needing a JS recalculation on every scroll tick.
  menuStyle.value = {
    top: `${top + window.scrollY}px`,
    left: `${left + window.scrollX}px`,
    minWidth: `${rootRect.width}px`,
    maxHeight: `${menuMaxHeight}px`,
    // Cap the width, but never below what fits on a narrow (mobile) viewport.
    maxWidth: props.menuWidth === 'wide' ? '48rem' : 'min(30rem, calc(100vw - 2rem))',
  }
}

function scheduleMenuPositionUpdate() {
  if (!open.value) return
  if (positionFrame !== null) cancelAnimationFrame(positionFrame)
  positionFrame = requestAnimationFrame(() => {
    positionFrame = null
    updateMenuPosition()
  })
}

function onFocus(event: FocusEvent) {
  open.value = true
  const input = event.target as HTMLInputElement
  input.select()
}

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (props.selectedLabel && value !== props.selectedLabel) emit('clear-selection')
  emit('update:modelValue', value)
  open.value = true
}

function selectOption(option: SearchSelectOption) {
  emit('update:modelValue', option.label)
  emit('select', option.value)
  open.value = false
}

function onCreate() {
  emit('create')
  open.value = false
}

function tryAutoSelect() {
  if (filteredOptions.value.length === 1) {
    const option = filteredOptions.value[0]
    if (option) selectOption(option)
    return
  }

  if (!normalizedQuery.value) return

  const exactMatch = props.options.find((option) => {
    const searchable = [option.label, option.searchText || '']
      .join(' ')
      .trim()
      .toLowerCase()

    return searchable === normalizedQuery.value || option.label.trim().toLowerCase() === normalizedQuery.value
  })

  if (exactMatch) selectOption(exactMatch)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    tryAutoSelect()
    open.value = false
  }
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !rootRef.value) return
  if (rootRef.value.contains(target)) return
  if (menuRef.value?.contains(target)) return
  open.value = false
}

function onWindowScroll() {
  // Update synchronously rather than via requestAnimationFrame - the extra
  // frame of scheduling delay is what made the menu visibly lag behind the
  // input while scrolling (most noticeable on iPad's momentum scrolling).
  updateMenuPosition()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  scheduleMenuPositionUpdate()
})

watch(() => filteredOptions.value.length, async () => {
  if (!open.value) return
  await nextTick()
  scheduleMenuPositionUpdate()
})

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick)
  window.addEventListener('resize', scheduleMenuPositionUpdate)
  window.addEventListener('scroll', onWindowScroll, true)
  window.visualViewport?.addEventListener('resize', scheduleMenuPositionUpdate)
  window.visualViewport?.addEventListener('scroll', scheduleMenuPositionUpdate)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  window.removeEventListener('resize', scheduleMenuPositionUpdate)
  window.removeEventListener('scroll', onWindowScroll, true)
  window.visualViewport?.removeEventListener('resize', scheduleMenuPositionUpdate)
  window.visualViewport?.removeEventListener('scroll', scheduleMenuPositionUpdate)
  if (positionFrame !== null) cancelAnimationFrame(positionFrame)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem) scale(0.98);
}

.search-select-menu {
  scrollbar-width: none;
}

.search-select-menu::-webkit-scrollbar {
  display: none;
}
</style>
