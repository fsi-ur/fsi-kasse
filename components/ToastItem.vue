<template>
  <article
    class="pointer-events-auto relative overflow-hidden rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur"
    :class="[containerClass]"
    :role="toast.type === 'error' ? 'alert' : 'status'"
    :aria-live="toast.type === 'error' ? 'assertive' : 'polite'"
    @mouseenter="pause"
    @mouseleave="resume"
    @focusin="pause"
    @focusout="resume"
  >
    <div class="flex items-center gap-3">
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold" :class="badgeClass">
        {{ badgeLabel }}
      </div>

      <p class="min-w-0 flex-1 text-sm font-medium text-slate-800">
        {{ toast.message }}
      </p>

      <button
        type="button"
        class="rounded-full h-6 w-6 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 cursor-pointer flex items-center justify-center"
        :aria-label="closeLabel"
        @click="close"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>

    <div class="mt-3 h-1 overflow-hidden rounded-full bg-slate-200/80">
      <div class="h-full rounded-full transition-[width] duration-75 ease-linear" :class="progressClass" :style="{ width: `${progressPercent}%` }" />
    </div>
  </article>
</template>

<script setup lang="ts">
import type { ToastItem as ToastItemShape } from '~/composables/useToast'
import { useI18n } from '~/composables/useI18n'

const props = defineProps<{
  toast: ToastItemShape
}>()

const emit = defineEmits<{
  (e: 'close', id: string): void
}>()

const { t } = useI18n()
const remainingMs = ref(props.toast.duration)
const paused = ref(false)

const progressPercent = computed(() => {
  if (props.toast.duration <= 0) return 0
  return Math.max(0, Math.min(100, (remainingMs.value / props.toast.duration) * 100))
})

const containerClass = computed(() => {
  if (props.toast.type === 'success') return 'border-emerald-200'
  if (props.toast.type === 'error') return 'border-rose-200'
  return 'border-slate-200'
})

const badgeClass = computed(() => {
  if (props.toast.type === 'success') return 'bg-emerald-100 text-emerald-700'
  if (props.toast.type === 'error') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
})

const progressClass = computed(() => {
  if (props.toast.type === 'success') return 'bg-emerald-500'
  if (props.toast.type === 'error') return 'bg-rose-500'
  return 'bg-slate-500'
})

const badgeLabel = computed(() => {
  if (props.toast.type === 'success') return 'OK'
  if (props.toast.type === 'error') return '!'
  return 'i'
})

const closeLabel = computed(() => t('actions.close'))

let intervalId: ReturnType<typeof setInterval> | null = null
let lastTick = 0
let closed = false

function pause() {
  paused.value = true
}

function resume() {
  paused.value = false
}

function close() {
  if (closed) return
  closed = true
  emit('close', props.toast.id)
}

onMounted(() => {
  lastTick = Date.now()
  intervalId = setInterval(() => {
    const now = Date.now()

    if (paused.value) {
      lastTick = now
      return
    }

    remainingMs.value = Math.max(0, remainingMs.value - (now - lastTick))
    lastTick = now

    if (remainingMs.value <= 0) close()
  }, 50)
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>
