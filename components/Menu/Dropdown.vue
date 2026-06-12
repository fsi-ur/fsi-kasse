<template>
  <div ref="wrapper" class="relative w-full">
    <div @click="toggleDropdown" class="w-full">
      <slot
        name="trigger"
        :open="open"
        :styling="triggerStyling"
        :disabled="disabled"
      />
    </div>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="open"
          ref="menuRef"
          class="absolute z-100 rounded-md border bg-white shadow-lg max-h-50 overflow-y-auto"
          :style="dropdownStyle"
          @mousedown.stop
          @click.stop
        >
          <slot styling="flex w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md cursor-pointer whitespace-nowrap" />
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number | null
  id: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: number | null): void
}>()

const wrapper = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
  minWidth: '0px',
  maxHeight: '12.5rem',
})
let positionFrame: number | null = null

const open = computed({
  get: () => props.modelValue === props.id,
  set: v => emit('update:modelValue', v ? props.id : null)
})

const disabled = computed(() => Boolean(props.disabled))
const triggerStyling = computed(() => [
  'input w-full flex items-center justify-between text-left',
].filter(Boolean).join(' '))

function toggleDropdown() {
  if (disabled.value) return
  emit('update:modelValue', open.value ? null : props.id)
}

function updateDropdownPosition() {
  if (!open.value || !wrapper.value) return

  const viewportPadding = 16
  const menuGap = 4
  const preferredMaxHeight = 200
  const wrapperRect = wrapper.value.getBoundingClientRect()
  const menuElement = menuRef.value
  const menuRect = menuElement?.getBoundingClientRect()
  const topBoundary = viewportPadding
  const bottomBoundary = window.innerHeight - viewportPadding
  const spaceBelow = bottomBoundary - wrapperRect.bottom
  const spaceAbove = wrapperRect.top - topBoundary
  const desiredMenuHeight = Math.min(menuElement?.scrollHeight ?? preferredMaxHeight, preferredMaxHeight)
  const shouldOpenUp = spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow
  const availableSpace = Math.max((shouldOpenUp ? spaceAbove : spaceBelow) - menuGap, 0)
  const menuMaxHeight = Math.max(Math.min(preferredMaxHeight, availableSpace), 0)
  const actualMenuHeight = Math.min(menuElement?.scrollHeight ?? desiredMenuHeight, menuMaxHeight || desiredMenuHeight)
  const measuredWidth = menuRect?.width ?? Math.max(wrapperRect.width, menuElement?.scrollWidth ?? 0)
  const maxLeft = window.innerWidth - viewportPadding - measuredWidth
  const left = window.scrollX + Math.min(
    Math.max(wrapperRect.left, viewportPadding),
    Math.max(viewportPadding, maxLeft),
  )
  const top = shouldOpenUp
    ? window.scrollY + Math.max(topBoundary, wrapperRect.top - actualMenuHeight - menuGap)
    : window.scrollY + Math.min(bottomBoundary, wrapperRect.bottom + menuGap)

  dropdownStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${wrapperRect.width}px`,
    width: 'max-content',
    maxWidth: '30vw',
    maxHeight: `${menuMaxHeight}px`,
  }
}

function scheduleDropdownPositionUpdate() {
  if (!open.value) return
  if (positionFrame !== null) cancelAnimationFrame(positionFrame)
  positionFrame = requestAnimationFrame(() => {
    positionFrame = null
    updateDropdownPosition()
  })
}

function closeDropdown() {
  emit('update:modelValue', null)
}

function handleClickOutside(e: MouseEvent) {
  if (!open.value) return
  if (!wrapper.value) return
  if (!wrapper.value.contains(e.target as Node)) {
    closeDropdown()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeDropdown()
}

function handleViewportChange() {
  scheduleDropdownPositionUpdate()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  scheduleDropdownPositionUpdate()
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  window.visualViewport?.addEventListener('resize', handleViewportChange)
  window.visualViewport?.addEventListener('scroll', handleViewportChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
  window.visualViewport?.removeEventListener('resize', handleViewportChange)
  window.visualViewport?.removeEventListener('scroll', handleViewportChange)
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
</style>
