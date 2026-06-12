<template>
  <div ref="rootRef" class="relative w-full">
    <div class="flex items-center gap-2">
      <input
        :value="currentQuery"
        :placeholder="placeholder"
        :disabled="disabled"
        class="input w-full"
        @focus="open = true"
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
          class="search-select-menu absolute z-70 rounded-md border bg-white shadow-lg w-max overflow-y-auto"
          :class="menuWidthClass"
          :style="menuStyle"
        >
          <button
            v-if="showCreateOption"
            type="button"
            class="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 rounded-md cursor-pointer whitespace-nowrap"
            @click="onCreate"
          >
            <span v-if="!hideCreateQuery">"{{ currentQuery }}"</span>
            <span class="text-orange-500 font-semibold">{{ createActionLabel }}</span>
          </button>

          <div v-if="showCreateOption" class="border-t" />

          <button
            v-for="option in filteredOptions"
            :key="option.key"
            type="button"
            class="flex w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md cursor-pointer whitespace-nowrap"
            :class="optionClass"
            @click="selectOption(option)"
          >
            <span class="overflow-hidden text-ellipsis">{{ option.label }}</span>
          </button>

          <div v-if="filteredOptions.length === 0" class="px-3 py-2 text-sm text-gray-500">
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
const normalizedQuery = computed(() => currentQuery.value.trim().toLowerCase())
const filteredOptions = computed(() => {
  if (!normalizedQuery.value) return props.options

  return props.options.filter((option) => {
    const searchable = `${option.label} ${option.searchText || ''}`.toLowerCase()
    return searchable.includes(normalizedQuery.value)
  })
})
const showCreateOption = computed(() => props.allowCreate && (props.hideCreateQuery || currentQuery.value.trim().length > 0))
const menuWidthClass = computed(() => props.menuWidth === 'wide' ? 'w-full max-w-[48rem]' : 'max-w-[30vw]')

function updateMenuPosition() {
  if (!open.value || !rootRef.value) return

  const viewportPadding = 16
  const menuGap = 4
  const preferredMaxHeight = 200
  const rootRect = rootRef.value.getBoundingClientRect()
  const menuElement = menuRef.value
  const menuRect = menuElement?.getBoundingClientRect()
  const topBoundary = viewportPadding
  const bottomBoundary = window.innerHeight - viewportPadding
  const spaceBelow = bottomBoundary - rootRect.bottom
  const spaceAbove = rootRect.top - topBoundary
  const desiredMenuHeight = Math.min(menuElement?.scrollHeight ?? preferredMaxHeight, preferredMaxHeight)
  const shouldOpenUp = spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow
  const availableSpace = Math.max((shouldOpenUp ? spaceAbove : spaceBelow) - menuGap, 0)
  const menuMaxHeight = Math.max(Math.min(preferredMaxHeight, availableSpace), 0)
  const actualMenuHeight = Math.min(menuElement?.scrollHeight ?? desiredMenuHeight, menuMaxHeight || desiredMenuHeight)
  const measuredWidth = menuRect?.width ?? Math.max(rootRect.width, menuElement?.scrollWidth ?? 0)
  const maxLeft = window.innerWidth - viewportPadding - measuredWidth
  const left = window.scrollX + Math.min(Math.max(rootRect.left, viewportPadding), Math.max(viewportPadding, maxLeft))
  const top = shouldOpenUp
    ? window.scrollY + Math.max(topBoundary, rootRect.top - actualMenuHeight - menuGap)
    : window.scrollY + Math.min(bottomBoundary, rootRect.bottom + menuGap)

  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${rootRect.width}px`,
    maxHeight: `${menuMaxHeight}px`,
    maxWidth: props.menuWidth === 'wide' ? '48rem' : '30vw',
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
  window.addEventListener('scroll', scheduleMenuPositionUpdate, true)
  window.visualViewport?.addEventListener('resize', scheduleMenuPositionUpdate)
  window.visualViewport?.addEventListener('scroll', scheduleMenuPositionUpdate)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  window.removeEventListener('resize', scheduleMenuPositionUpdate)
  window.removeEventListener('scroll', scheduleMenuPositionUpdate, true)
  window.visualViewport?.removeEventListener('resize', scheduleMenuPositionUpdate)
  window.visualViewport?.removeEventListener('scroll', scheduleMenuPositionUpdate)
  if (positionFrame !== null) cancelAnimationFrame(positionFrame)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.search-select-menu {
  scrollbar-width: none;
}

.search-select-menu::-webkit-scrollbar {
  display: none;
}
</style>
