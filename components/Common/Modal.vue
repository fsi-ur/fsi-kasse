<template>
  <Teleport :to="teleportTo">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @mousedown="onBackdropMousedown"
      @click.self="handleBackdropClick"
    >
      <section
        :class="[
          'w-full rounded-xl bg-white p-4 sm:p-6 shadow-xl',
          'max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-none',
          widthClass,
          panelClass,
        ]"
      >
        <header v-if="$slots.title || title" :class="headerClass">
          <slot name="title">
            <h3 :id="titleId" class="text-lg font-semibold text-slate-900">
              {{ title }}
            </h3>
          </slot>
        </header>

        <div :class="bodyClass">
          <slot />
        </div>

        <footer v-if="$slots.footer" :class="footerClass">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script lang="ts">
let bodyScrollLockCount = 0
let bodyScrollLockY = 0

function lockBodyScroll() {
  bodyScrollLockCount += 1
  if (bodyScrollLockCount > 1) return

  bodyScrollLockY = window.scrollY
  const body = document.body.style
  body.position = 'fixed'
  body.top = `-${bodyScrollLockY}px`
  body.left = '0'
  body.right = '0'
  body.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (bodyScrollLockCount === 0) return
  bodyScrollLockCount -= 1
  if (bodyScrollLockCount > 0) return

  const body = document.body.style
  body.position = ''
  body.top = ''
  body.left = ''
  body.right = ''
  body.overflow = ''
  window.scrollTo(0, bodyScrollLockY)
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  widthClass?: string
  panelClass?: string
  headerClass?: string
  bodyClass?: string
  footerClass?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  teleportTo?: string
}>(), {
  title: '',
  widthClass: 'max-w-md',
  panelClass: '',
  headerClass: '',
  bodyClass: 'mt-4 space-y-4',
  footerClass: 'mt-6 flex justify-end gap-3',
  closeOnBackdrop: true,
  closeOnEscape: true,
  teleportTo: 'body',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'close'): void
}>()

const titleId = `modal-title-${useId()}`

let isLockedByThisInstance = false
let backdropMousedownOnSelf = false

if (import.meta.client) {
  watch(() => props.modelValue, (isOpen) => {
    if (isOpen === isLockedByThisInstance) return
    isLockedByThisInstance = isOpen
    if (isOpen) lockBodyScroll()
    else unlockBodyScroll()
  }, { immediate: true })
}

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function onBackdropMousedown(event: MouseEvent) {
  backdropMousedownOnSelf = event.target === event.currentTarget
}

function handleBackdropClick() {
  if (props.closeOnBackdrop && backdropMousedownOnSelf) close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.closeOnEscape || !props.modelValue || event.key !== 'Escape') return
  close()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (isLockedByThisInstance) {
    isLockedByThisInstance = false
    unlockBodyScroll()
  }
})
</script>
