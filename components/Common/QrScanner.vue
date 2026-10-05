<template>
  <div class="space-y-2">
    <div class="relative overflow-hidden rounded-lg bg-black aspect-square sm:aspect-video">
      <video ref="videoRef" class="h-full w-full object-cover" muted playsinline />

      <div v-if="state !== 'running'" class="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/90">
        <span v-if="state === 'starting'" class="inline-flex items-center gap-2">
          <Icon name="material-symbols:progress-activity" class="h-5 w-5 animate-spin" aria-hidden="true" />
          {{ t('scanner.starting') }}
        </span>
        <span v-else>{{ errorText }}</span>
      </div>

      <div v-if="state === 'running'" class="absolute bottom-2 right-2 flex gap-2">
        <button
          v-if="hasFlash"
          type="button"
          class="rounded-full bg-black/60 p-2 text-white cursor-pointer hover:bg-black/80"
          :aria-label="t('scanner.torch')"
          :aria-pressed="flashOn"
          @click="toggleFlash"
        >
          <Icon :name="flashOn ? 'material-symbols:flashlight-on-rounded' : 'material-symbols:flashlight-on-outline-rounded'" class="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          v-if="cameras.length > 1"
          type="button"
          class="rounded-full bg-black/60 p-2 text-white cursor-pointer hover:bg-black/80"
          :aria-label="t('scanner.switchCamera')"
          @click="switchCamera"
        >
          <Icon name="material-symbols:cameraswitch-outline-rounded" class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type QrScannerType from 'qr-scanner'
import { useI18n } from '~/composables/useI18n'

const props = withDefaults(defineProps<{
  /** Camera runs only while active; the stream stops otherwise and on unmount. */
  active?: boolean
}>(), {
  active: true,
})

const emit = defineEmits<{
  (e: 'detected', value: string): void
}>()

/** The same code is reported again only after this pause. */
const REPEAT_AFTER_MS = 2500

const { t } = useI18n()
const videoRef = ref<HTMLVideoElement | null>(null)
const state = ref<'idle' | 'starting' | 'running' | 'denied' | 'unavailable' | 'insecure'>('idle')
const hasFlash = ref(false)
const flashOn = ref(false)
const cameras = ref<Array<{ id: string, label: string }>>([])
const cameraIndex = ref(0)

let scanner: QrScannerType | null = null
let lastValue = ''
let lastAt = 0

const errorText = computed(() => {
  if (state.value === 'denied') return t('scanner.cameraDenied')
  if (state.value === 'insecure') return t('scanner.insecureContext')
  if (state.value === 'unavailable') return t('scanner.cameraUnavailable')
  return ''
})

function onDecode(result: { data: string }) {
  const now = Date.now()
  if (result.data === lastValue && now - lastAt < REPEAT_AFTER_MS) return
  lastValue = result.data
  lastAt = now
  emit('detected', result.data)
}

async function start() {
  if (!videoRef.value || scanner) return
  if (!window.isSecureContext) {
    state.value = 'insecure'
    return
  }

  state.value = 'starting'
  try {
    const { default: QrScanner } = await import('qr-scanner')
    if (!props.active || !videoRef.value) {
      state.value = 'idle'
      return
    }
    scanner = new QrScanner(videoRef.value, onDecode, {
      returnDetailedScanResult: true,
      preferredCamera: 'environment',
      maxScansPerSecond: 10,
    })
    scanner.setInversionMode('both')
    await scanner.start()
    state.value = 'running'
    hasFlash.value = await scanner.hasFlash().catch(() => false)
    cameras.value = await QrScanner.listCameras(true).catch(() => [])
  } catch (error) {
    const name = (error as { name?: string })?.name ?? ''
    state.value = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
    stop()
  }
}

function stop() {
  scanner?.stop()
  scanner?.destroy()
  scanner = null
  flashOn.value = false
  if (state.value === 'running' || state.value === 'starting') state.value = 'idle'
}

async function toggleFlash() {
  if (!scanner) return
  await scanner.toggleFlash().catch(() => {})
  flashOn.value = scanner.isFlashOn()
}

async function switchCamera() {
  if (!scanner || cameras.value.length < 2) return
  cameraIndex.value = (cameraIndex.value + 1) % cameras.value.length
  await scanner.setCamera(cameras.value[cameraIndex.value]!.id).catch(() => {})
  hasFlash.value = await scanner.hasFlash().catch(() => false)
  flashOn.value = false
}

watch(() => props.active, (active) => {
  if (active) start()
  else stop()
})

onMounted(() => {
  if (props.active) start()
})
onBeforeUnmount(stop)
</script>
