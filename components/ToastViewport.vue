<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
    <TransitionGroup name="toast">
      <ToastItem
        v-for="toast in toasts"
        :key="toast.id"
        :toast="toast"
        @close="remove"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.toast-move {
  transition: transform 0.2s ease;
}
</style>
