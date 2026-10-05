<template>
  <CommonModal
    :model-value="modelValue"
    :title="t('vouchers.pdf.title', { name: batch.name })"
    width-class="max-w-6xl"
    :close-on-backdrop="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <!-- Steps -->
    <ol class="flex flex-wrap gap-2 text-sm">
      <li v-for="entry in steps" :key="entry.step">
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 transition-colors"
          :class="step === entry.step
            ? 'bg-accent-500 text-white'
            : entry.enabled ? 'bg-base-100 text-base-700 hover:bg-base-200 cursor-pointer' : 'bg-base-50 text-base-400 cursor-not-allowed'"
          :disabled="!entry.enabled"
          @click="step = entry.step"
        >
          {{ entry.step }}. {{ entry.label }}
        </button>
      </li>
    </ol>

    <!-- Step 1: choose PDF -->
    <section v-if="step === 1" class="space-y-4">
      <p class="text-sm text-base-600">{{ t('vouchers.pdf.intro') }}</p>

      <div class="field">
        <label>{{ t('vouchers.pdf.file') }}</label>
        <input type="file" accept="application/pdf" class="input" @change="onFileChange" />
        <span v-if="fileName" class="text-xs text-base-500">{{ t('vouchers.pdf.fileInfo', { name: fileName, pages: sourceBoxes.length }) }}</span>
      </div>

      <div class="field">
        <label>{{ t('vouchers.pdf.mode') }}</label>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            v-for="option in (['template', 'pages'] as const)"
            :key="option"
            type="button"
            class="rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer"
            :class="layout.mode === option ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-base-300 bg-white text-base-700 hover:bg-base-50'"
            @click="setMode(option)"
          >
            <span class="block font-semibold">{{ t(`vouchers.pdf.mode_${option}`) }}</span>
            <span class="block text-xs text-base-500">{{ t(`vouchers.pdf.mode_${option}Hint`) }}</span>
          </button>
        </div>
      </div>

      <div class="field">
        <label>{{ t('vouchers.export.selection') }}</label>
        <CommonSelectMenu v-model="statusFilter" :options="statusOptions" />
        <span class="text-xs text-base-500">{{ t('vouchers.pdf.codeCount', { count: codes.length }) }}</span>
      </div>

      <div v-if="savedSnapshot || otherLayouts.length" class="field">
        <label>{{ t('vouchers.pdf.copyLayout') }}</label>
        <CommonSelectMenu
          :model-value="layoutSource"
          :options="layoutSourceOptions"
          @update:model-value="selectLayoutSource($event)"
        />
      </div>

      <p v-if="hasSavedLayout" class="rounded-lg bg-info-50 px-3 py-2 text-sm text-info-900">{{ t('vouchers.pdf.savedLayoutLoaded') }}</p>
      <ul v-if="stepOneWarnings.length" class="space-y-1">
        <li v-for="warning in stepOneWarnings" :key="warning" class="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">{{ warning }}</li>
      </ul>
    </section>

    <!-- Step 2: place QR codes -->
    <section v-else-if="step === 2" class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="min-w-0 space-y-2">
        <div v-if="layout.mode === 'template' && sourceBoxes.length > 1" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-base-500">{{ t('vouchers.pdf.templatePage') }}</span>
          <button
            v-for="(_, index) in sourceBoxes"
            :key="index"
            type="button"
            class="rounded-md px-2.5 py-1 cursor-pointer"
            :class="previewPage === index ? 'bg-accent-500 text-white' : 'bg-base-100 hover:bg-base-200'"
            @click="previewPage = index"
          >
            {{ index + 1 }}
          </button>
        </div>

        <div ref="stageRef" class="w-full overflow-auto rounded-lg border border-base-200 bg-base-100 p-2">
          <div class="relative mx-auto select-none" :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }">
            <canvas ref="canvasRef" class="absolute inset-0 bg-white shadow" :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }" />
            <div
              v-for="entry in visibleSlots"
              :key="entry.index"
              class="absolute touch-none outline-none"
              :class="selected === entry.index ? 'ring-2 ring-accent-500' : 'ring-1 ring-link-500/70'"
              :style="slotStyle(entry.slot)"
              tabindex="0"
              @pointerdown="startDrag($event, entry.index, 'move')"
              @keydown="onSlotKeydown($event, entry.index)"
              @focus="selected = entry.index"
            >
              <svg :viewBox="`0 0 ${sampleQrTotal} ${sampleQrTotal}`" class="pointer-events-none block h-full w-full" shape-rendering="crispEdges">
                <rect v-if="layout.background_color" :width="sampleQrTotal" :height="sampleQrTotal" :fill="layout.background_color" />
                <path :d="sampleQrPath" :fill="layout.qr_color" />
              </svg>
              <span
                v-if="entry.slot.text !== 'none'"
                class="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap leading-none"
                :class="entry.slot.text === 'below' ? 'top-full' : 'bottom-full'"
                :style="{ fontSize: `${entry.slot.font_size * scale}px`, color: layout.text_color ?? layout.qr_color, fontFamily: 'Helvetica, Arial, sans-serif', padding: `${entry.slot.font_size * 0.3 * scale}px 0` }"
              >
                {{ sampleCodeFormatted }}
              </span>
              <span class="pointer-events-none absolute left-0 top-0 rounded-br bg-link-600 px-1 text-[10px] font-semibold text-white">
                {{ fillNumber(entry.index) }}
              </span>
              <span
                class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-accent-500"
                @pointerdown.stop="startDrag($event, entry.index, 'resize')"
              />
            </div>
          </div>
        </div>
        <p class="text-xs text-base-500">{{ t('vouchers.pdf.placeHint') }}</p>
      </div>

      <aside class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary px-3!" @click="addSlot">{{ t('vouchers.pdf.addSlot') }}</button>
          <button type="button" class="btn-secondary px-3!" :disabled="selected == null" @click="duplicateSlot">{{ t('vouchers.pdf.duplicateSlot') }}</button>
          <button type="button" class="btn-secondary px-3! text-danger-700!" :disabled="selected == null" @click="deleteSlot">{{ t('vouchers.pdf.deleteSlot') }}</button>
        </div>

        <div v-if="selectedSlot" class="space-y-2 rounded-lg border border-base-200 p-3">
          <h4 class="section-title">{{ t('vouchers.pdf.slotTitle', { number: fillNumber(selected!) }) }}</h4>
          <div class="grid grid-cols-3 gap-2">
            <div class="field">
              <label>{{ t('vouchers.pdf.x') }}</label>
              <input type="number" step="0.5" class="input" :value="toMm(selectedSlot.x)" @change="setSlotMm('x', $event)" />
            </div>
            <div class="field">
              <label>{{ t('vouchers.pdf.y') }}</label>
              <input type="number" step="0.5" class="input" :value="toMm(selectedSlot.y)" @change="setSlotMm('y', $event)" />
            </div>
            <div class="field">
              <label>{{ t('vouchers.pdf.size') }}</label>
              <input type="number" step="0.5" min="5" class="input" :value="toMm(selectedSlot.size)" @change="setSlotMm('size', $event)" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="field">
              <label>{{ t('vouchers.pdf.text') }}</label>
              <CommonSelectMenu v-model="selectedSlot.text" :options="textOptions" />
            </div>
            <div class="field">
              <label>{{ t('vouchers.pdf.fontSize') }}</label>
              <input v-model.number="selectedSlot.font_size" type="number" min="6" max="24" step="0.5" class="input" :disabled="selectedSlot.text === 'none'" />
            </div>
          </div>
        </div>

        <details class="rounded-lg border border-base-200 p-3">
          <summary class="section-title cursor-pointer">{{ t('vouchers.pdf.grid') }}</summary>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <div class="field"><label>{{ t('vouchers.pdf.gridRows') }}</label><input v-model.number="grid.rows" type="number" min="1" max="20" class="input" /></div>
            <div class="field"><label>{{ t('vouchers.pdf.gridCols') }}</label><input v-model.number="grid.cols" type="number" min="1" max="20" class="input" /></div>
            <div class="field"><label>{{ t('vouchers.pdf.x') }}</label><input v-model.number="grid.x" type="number" step="0.5" class="input" /></div>
            <div class="field"><label>{{ t('vouchers.pdf.y') }}</label><input v-model.number="grid.y" type="number" step="0.5" class="input" /></div>
            <div class="field"><label>{{ t('vouchers.pdf.gridDx') }}</label><input v-model.number="grid.dx" type="number" step="0.5" class="input" /></div>
            <div class="field"><label>{{ t('vouchers.pdf.gridDy') }}</label><input v-model.number="grid.dy" type="number" step="0.5" class="input" /></div>
            <div class="field col-span-2"><label>{{ t('vouchers.pdf.size') }}</label><input v-model.number="grid.size" type="number" step="0.5" min="5" class="input" /></div>
          </div>
          <button type="button" class="btn-outline mt-2 w-full" @click="applyGrid">{{ t('vouchers.pdf.gridApply') }}</button>
        </details>

        <div class="space-y-2 rounded-lg border border-base-200 p-3">
          <h4 class="section-title">{{ t('vouchers.pdf.colors') }}</h4>
          <VoucherColorFields
            v-model:qr-color="layout.qr_color"
            v-model:background-color="layout.background_color"
            v-model:text-color="layout.text_color"
            show-text
            stacked
          />
          <div class="field">
            <label>{{ t('vouchers.export.margin') }}</label>
            <div class="flex items-center gap-2">
              <input
                type="number"
                min="0"
                :max="MAX_QR_QUIET_ZONE"
                step="1"
                class="input w-24!"
                :value="layout.quiet_zone"
                @change="setQuietZone"
              />
              <span class="text-sm text-base-600">{{ t('vouchers.export.marginUnit') }}</span>
            </div>
            <span class="text-xs text-base-500">{{ t('vouchers.pdf.marginHelp') }}</span>
          </div>
        </div>

        <ul v-if="placementWarnings.length" class="space-y-1">
          <li v-for="warning in placementWarnings" :key="warning" class="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-900">{{ warning }}</li>
        </ul>

        <button
          type="button"
          class="btn-outline inline-flex w-full items-center justify-center gap-2"
          :class="{ 'border-success-300! bg-success-50! text-success-700! opacity-100!': layoutIsSaved }"
          :disabled="savingLayout || !layout.slots.length || layoutIsSaved"
          @click="saveLayout"
        >
          <Icon v-if="layoutIsSaved" name="material-symbols:check-rounded" class="h-4 w-4" aria-hidden="true" />
          {{ savingLayout ? t('vouchers.pdf.savingLayout') : layoutIsSaved ? t('vouchers.pdf.layoutUpToDate') : t('vouchers.pdf.saveLayout') }}
        </button>
      </aside>
    </section>

    <!-- Step 3: generate -->
    <section v-else class="space-y-4">
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt class="text-base-500">{{ t('vouchers.pdf.summaryVouchers') }}</dt>
        <dd>{{ codes.length }}</dd>
        <dt class="text-base-500">{{ t('vouchers.pdf.summaryPages') }}</dt>
        <dd>{{ plan?.pages ?? '–' }}</dd>
        <dt class="text-base-500">{{ t('vouchers.pdf.summaryEmpty') }}</dt>
        <dd>{{ plan?.emptySlots ?? '–' }}</dd>
      </dl>

      <ul v-if="generateWarnings.length" class="space-y-1">
        <li v-for="warning in generateWarnings" :key="warning" class="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">{{ warning }}</li>
      </ul>

      <p class="rounded-lg bg-info-50 px-3 py-2 text-sm text-info-900">{{ t('vouchers.pdf.printHint') }}</p>

      <div v-if="progress" class="space-y-1">
        <div class="h-2 rounded-full bg-base-100">
          <div class="h-2 rounded-full bg-accent-500 transition-all" :style="{ width: `${Math.round(progress.done / Math.max(1, progress.total) * 100)}%` }" />
        </div>
        <p class="text-xs text-base-500">{{ t('vouchers.pdf.progress', { done: progress.done, total: progress.total }) }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-outline" :disabled="generating || !canGenerate" @click="generate(true)">{{ t('vouchers.pdf.testPage') }}</button>
        <button type="button" class="btn-primary" :disabled="generating || !canGenerate" @click="generate(false)">{{ t('vouchers.pdf.generate') }}</button>
      </div>
    </section>

    <template #footer>
      <button type="button" class="btn-secondary mr-auto" @click="$emit('update:modelValue', false)">{{ t('actions.close') }}</button>
      <button v-if="step > 1" type="button" class="btn-secondary" @click="step -= 1">{{ t('vouchers.pdf.back') }}</button>
      <button v-if="step < 3" type="button" class="btn-primary" :disabled="!steps[step]?.enabled" @click="step += 1">{{ t('vouchers.pdf.next') }}</button>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useExportStatusOptions } from '~/composables/useVoucherLabels'
import { saveBlob } from '~/composables/useFileDownload'
import { contrastRatio, isInverted, MIN_QR_CONTRAST, type RgbColor } from '~/utils/voucherColors'
import { formatVoucherCode } from '~/utils/voucherCode'
import {
  DEFAULT_QR_QUIET_ZONE,
  MAX_LAYOUT_SLOTS,
  MAX_QR_QUIET_ZONE,
  PT_PER_MM,
  slotsInFillOrder,
  validateVoucherPdfLayout,
  type VoucherPdfLayout,
  type VoucherPdfMode,
  type VoucherPdfSlot,
} from '~/utils/voucherPdfLayout'
import {
  assertNotRotated,
  cropBoxOf,
  generateVoucherPdf,
  loadSourcePdf,
  planVoucherPdf,
  validateSourceBoxes,
  VoucherPdfError,
  type VoucherPdfPlan,
} from '~/utils/voucherPdf'

const props = defineProps<{
  modelValue: boolean
  batch: any
  /** All batches, to copy a saved layout from another one. */
  batches: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'layout-saved'): void
}>()

const { t } = useI18n()
const toast = useToast()
const statusOptions = useExportStatusOptions()
const textOptions = computed(() => (['none', 'below', 'above'] as const).map(value => ({
  value,
  label: t(`vouchers.pdf.text${value[0]!.toUpperCase()}${value.slice(1)}`),
})))

/** A QR smaller than this gets unreliable with phone cameras at a dim stand. */
const MIN_QR_MM = 15
const NUDGE_MM = 0.5
const NUDGE_LARGE_MM = 5
const DEFAULT_SLOT_MM = 30
const PAGE_SIZE_TOLERANCE = 1
/** Below this average absolute deviation the area under a QR code counts as calm. */
const MAX_CALM_DEVIATION = 18

const step = ref(1)
const fileName = ref('')
const sourceBytes = shallowRef<ArrayBuffer | null>(null)
const sourceBoxes = ref<Array<{ x: number, y: number, width: number, height: number }>>([])
const pdfjsDoc = shallowRef<PDFDocumentProxy | null>(null)
const statusFilter = ref('')
const codes = ref<string[]>([])
const selected = ref<number | null>(null)
const previewPage = ref(0)
const savingLayout = ref(false)
const generating = ref(false)
const progress = ref<{ done: number, total: number } | null>(null)
const sourceError = ref<string | null>(null)
const slotSamples = ref<Map<number, { color: RgbColor, deviation: number }>>(new Map())

const layout = reactive<VoucherPdfLayout>(defaultLayout())
const grid = reactive({ rows: 4, cols: 2, x: 10, y: 10, dx: 105, dy: 74, size: 30 })

const stageRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stageWidth = ref(600)

function defaultLayout(): VoucherPdfLayout {
  return { version: 1, mode: 'template', page_width: 0, page_height: 0, qr_color: '#000000', background_color: '#FFFFFF', text_color: null, quiet_zone: DEFAULT_QR_QUIET_ZONE, slots: [] }
}

const savedLayout = computed<VoucherPdfLayout | null>(() => {
  const validated = props.batch?.pdf_layout ? validateVoucherPdfLayout(props.batch.pdf_layout) : null
  return validated?.ok ? validated.layout : null
})
const hasSavedLayout = computed(() => Boolean(savedLayout.value))
/** Serialized last saved layout; kept locally because the batch prop is not refreshed after a save. */
const savedSnapshot = ref<string | null>(null)

const otherLayouts = computed(() => props.batches.filter(entry => entry.id !== props.batch.id && entry.pdf_layout))

/** Where the layout being edited came from: this batch's saved one, an empty one, or another batch's id. */
const OWN_LAYOUT = 'own'
const EMPTY_LAYOUT = 'empty'
const layoutSource = ref<string>(EMPTY_LAYOUT)
/** The chosen source in comparable form, to mark it as changed once edited. */
const sourceSnapshot = ref('')

/** Page size comes from the selected PDF, so it is left out when comparing layouts. */
function comparable(source: VoucherPdfLayout) {
  const { page_width: _width, page_height: _height, ...rest } = source
  return JSON.stringify(rest)
}

const layoutModified = computed(() => {
  const validated = validateVoucherPdfLayout(currentLayout())
  // An empty layout fails validation (no slots) and only counts as changed once it has some.
  if (!validated.ok) return layout.slots.length > 0 || layoutSource.value !== EMPTY_LAYOUT
  return comparable(validated.layout) !== sourceSnapshot.value
})

const layoutSourceOptions = computed(() => {
  const label = (value: string, name: string) => value === layoutSource.value && layoutModified.value
    ? t('vouchers.pdf.layoutModified', { name })
    : name
  return [
    ...(savedSnapshot.value ? [{ value: OWN_LAYOUT, label: label(OWN_LAYOUT, t('vouchers.pdf.ownLayout')) }] : []),
    { value: EMPTY_LAYOUT, label: label(EMPTY_LAYOUT, t('vouchers.pdf.emptyLayout')) },
    ...otherLayouts.value.map(other => ({ value: String(other.id), label: label(String(other.id), other.name as string) })),
  ]
})

function useLayoutSource(source: string, value: VoucherPdfLayout) {
  applyLayout(value)
  layoutSource.value = source
  sourceSnapshot.value = source === EMPTY_LAYOUT ? '' : comparable(value)
}

function applyLayout(source: VoucherPdfLayout) {
  Object.assign(layout, JSON.parse(JSON.stringify(source)))
  selected.value = layout.slots.length ? 0 : null
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  step.value = 1
  savedSnapshot.value = savedLayout.value ? JSON.stringify(savedLayout.value) : null
  if (savedLayout.value) useLayoutSource(OWN_LAYOUT, savedLayout.value)
  else useLayoutSource(EMPTY_LAYOUT, defaultLayout())
  statusFilter.value = ''
  loadCodes()
}, { immediate: true })

watch(statusFilter, loadCodes)

async function loadCodes() {
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}` : ''
    const res = await $fetch<any>(`/api/vouchers/batches/${props.batch.id}/codes${params}`)
    if (res.ok) codes.value = res.codes.map((entry: any) => entry.code)
    else toast.error(res.error || t('common.unknownError'))
  } catch {
    toast.error(t('common.unknownError'))
  }
}

function selectLayoutSource(source: string) {
  if (source === OWN_LAYOUT && savedSnapshot.value) {
    useLayoutSource(OWN_LAYOUT, JSON.parse(savedSnapshot.value))
    toast.info(t('vouchers.pdf.ownLayoutRestored'))
    return
  }
  if (source === EMPTY_LAYOUT) {
    // Keeps the page size of the PDF already chosen.
    useLayoutSource(EMPTY_LAYOUT, { ...defaultLayout(), page_width: layout.page_width, page_height: layout.page_height })
    return
  }
  const other = otherLayouts.value.find(entry => String(entry.id) === source)
  const validated = other ? validateVoucherPdfLayout(other.pdf_layout) : null
  if (validated?.ok) {
    useLayoutSource(source, validated.layout)
    toast.info(t('vouchers.pdf.layoutCopied', { name: other.name }))
  }
}

function setMode(mode: VoucherPdfMode) {
  if (layout.mode === mode) return
  layout.mode = mode
  // Pages mode applies the slots of the reference page to every page.
  if (mode === 'pages') layout.slots = layout.slots.filter(slot => slot.page === 0)
  previewPage.value = 0
}

function errorMessage(error: unknown) {
  if (error instanceof VoucherPdfError) return t(`vouchers.pdf.errors.${error.code}`, error.params)
  return t('vouchers.pdf.errors.invalid')
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  sourceError.value = null
  try {
    const bytes = await file.arrayBuffer()
    const source = await loadSourcePdf(bytes.slice(0))
    const pages = source.getPages()
    pages.forEach(assertNotRotated)
    sourceBoxes.value = pages.map(cropBoxOf)
    sourceBytes.value = bytes
    fileName.value = file.name
    previewPage.value = 0
    await loadPreviewDocument(bytes)

    const reference = sourceBoxes.value[0]!
    if (!layout.page_width) {
      layout.page_width = reference.width
      layout.page_height = reference.height
    }
  } catch (error) {
    sourceBytes.value = null
    sourceBoxes.value = []
    fileName.value = ''
    sourceError.value = errorMessage(error)
    toast.error(sourceError.value)
  }
}

async function loadPreviewDocument(bytes: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  await pdfjsDoc.value?.loadingTask.destroy()
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  pdfjsDoc.value = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
}

const referenceBox = computed(() => sourceBoxes.value[layout.mode === 'template' ? previewPage.value : 0] ?? null)
const scale = computed(() => referenceBox.value ? stageWidth.value / referenceBox.value.width : 1)
const stageHeight = computed(() => referenceBox.value ? referenceBox.value.height * scale.value : 0)

const pageSizeDiffers = computed(() => {
  if (!savedLayout.value || !sourceBoxes.value.length) return false
  const reference = sourceBoxes.value[0]!
  return Math.abs(reference.width - savedLayout.value.page_width) > PAGE_SIZE_TOLERANCE
    || Math.abs(reference.height - savedLayout.value.page_height) > PAGE_SIZE_TOLERANCE
})

const stepOneWarnings = computed(() => {
  const list: string[] = []
  if (sourceError.value) list.push(sourceError.value)
  if (pageSizeDiffers.value) list.push(t('vouchers.pdf.pageSizeDiffers'))
  if (!codes.value.length) list.push(t('vouchers.pdf.noCodes'))
  return list
})

const steps = computed(() => [
  { step: 1, label: t('vouchers.pdf.step1'), enabled: true },
  { step: 2, label: t('vouchers.pdf.step2'), enabled: Boolean(sourceBytes.value) },
  { step: 3, label: t('vouchers.pdf.step3'), enabled: Boolean(sourceBytes.value) && layout.slots.length > 0 && codes.value.length > 0 },
])

// --- Preview rendering --------------------------------------------------

let renderTask: { cancel: () => void, promise: Promise<void> } | null = null

async function renderPreview() {
  const doc = pdfjsDoc.value
  const canvas = canvasRef.value
  const box = referenceBox.value
  if (!doc || !canvas || !box) return

  stageWidth.value = Math.max(240, Math.min(900, (stageRef.value?.clientWidth ?? 600) - 16))
  const page = await doc.getPage((layout.mode === 'template' ? previewPage.value : 0) + 1)
  const ratio = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale.value * ratio })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  renderTask?.cancel()
  const task = page.render({ canvas, viewport })
  renderTask = task
  try {
    await task.promise
  } catch {
    return
  }
  sampleSlots()
}

watch([step, previewPage, pdfjsDoc], async () => {
  if (step.value !== 2) return
  await nextTick()
  renderPreview()
})

function onResize() {
  if (step.value === 2) renderPreview()
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  renderTask?.cancel()
  pdfjsDoc.value?.loadingTask.destroy()
})

/**
 * Samples the rendered design under every slot's quiet-zone ring, so a
 * transparent background can be checked for contrast and calmness.
 */
function sampleSlots() {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d', { willReadFrequently: true })
  if (!canvas || !context) return

  const pixelScale = canvas.width / (referenceBox.value?.width ?? 1)
  const samples = new Map<number, { color: RgbColor, deviation: number }>()
  for (const entry of visibleSlots.value) {
    const { x, y, size } = entry.slot
    const left = Math.max(0, Math.floor(x * pixelScale))
    const top = Math.max(0, Math.floor(y * pixelScale))
    const edge = Math.max(1, Math.floor(size * pixelScale))
    // Without a quiet zone the design right at the code's edge is what matters.
    const ring = Math.max(2, Math.floor(edge * quietShare.value))
    let data: Uint8ClampedArray
    try {
      data = context.getImageData(left, top, Math.min(edge, canvas.width - left), Math.min(edge, canvas.height - top)).data
    } catch {
      continue
    }
    const width = Math.min(edge, canvas.width - left)
    const height = Math.min(edge, canvas.height - top)
    const pixels: RgbColor[] = []
    for (let py = 0; py < height; py += 2) {
      for (let px = 0; px < width; px += 2) {
        const inRing = px < ring || py < ring || px >= width - ring || py >= height - ring
        if (!inRing) continue
        const offset = (py * width + px) * 4
        pixels.push({ r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! })
      }
    }
    if (!pixels.length) continue
    const mean = {
      r: pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length,
      g: pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length,
      b: pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length,
    }
    const deviation = pixels.reduce((sum, p) => sum + Math.abs(p.r - mean.r) + Math.abs(p.g - mean.g) + Math.abs(p.b - mean.b), 0) / pixels.length / 3
    samples.set(entry.index, { color: mean, deviation })
  }
  slotSamples.value = samples
}

// --- Slots --------------------------------------------------------------

/** Share of a slot's edge that is quiet zone (4 of 29 modules for our 11-char codes by default). */
const quietShare = computed(() => layout.quiet_zone / (sampleQr.value.size + layout.quiet_zone * 2))

function setQuietZone(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  layout.quiet_zone = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), MAX_QR_QUIET_ZONE) : DEFAULT_QR_QUIET_ZONE
  input.value = String(layout.quiet_zone)
  nextTick(sampleSlots)
}

const visibleSlots = computed(() => layout.slots
  .map((slot, index) => ({ slot, index }))
  .filter(entry => entry.slot.page === (layout.mode === 'template' ? previewPage.value : 0)))

const fillOrder = computed(() => {
  const ordered = slotsInFillOrder(layout)
  return new Map(ordered.map((slot, position) => [layout.slots.indexOf(slot), position + 1]))
})

function fillNumber(index: number) {
  return fillOrder.value.get(index) ?? index + 1
}

const selectedSlot = computed(() => selected.value == null ? null : layout.slots[selected.value] ?? null)

const toMm = (pt: number) => Math.round(pt / PT_PER_MM * 10) / 10
const toPt = (mm: number) => mm * PT_PER_MM

function clampSlot(slot: VoucherPdfSlot) {
  const box = referenceBox.value
  if (!box) return
  slot.size = Math.min(Math.max(slot.size, toPt(5)), box.width, box.height)
  slot.x = Math.min(Math.max(slot.x, 0), box.width - slot.size)
  slot.y = Math.min(Math.max(slot.y, 0), box.height - slot.size)
}

function setSlotMm(field: 'x' | 'y' | 'size', event: Event) {
  const slot = selectedSlot.value
  const value = Number((event.target as HTMLInputElement).value)
  if (!slot || !Number.isFinite(value)) return
  slot[field] = toPt(value)
  clampSlot(slot)
  sampleSlots()
}

function addSlot() {
  if (layout.slots.length >= MAX_LAYOUT_SLOTS || !referenceBox.value) return
  const size = Math.min(toPt(DEFAULT_SLOT_MM), referenceBox.value.width, referenceBox.value.height)
  const slot: VoucherPdfSlot = {
    page: layout.mode === 'template' ? previewPage.value : 0,
    x: (referenceBox.value.width - size) / 2,
    y: (referenceBox.value.height - size) / 2,
    size,
    text: 'below',
    font_size: 9,
  }
  layout.slots.push(slot)
  selected.value = layout.slots.length - 1
  nextTick(sampleSlots)
}

function duplicateSlot() {
  const slot = selectedSlot.value
  if (!slot || layout.slots.length >= MAX_LAYOUT_SLOTS) return
  const copy = { ...slot, x: slot.x + toPt(5), y: slot.y + toPt(5) }
  clampSlot(copy)
  layout.slots.push(copy)
  selected.value = layout.slots.length - 1
  nextTick(sampleSlots)
}

function deleteSlot() {
  if (selected.value == null) return
  layout.slots.splice(selected.value, 1)
  selected.value = layout.slots.length ? Math.min(selected.value, layout.slots.length - 1) : null
  nextTick(sampleSlots)
}

function applyGrid() {
  const page = layout.mode === 'template' ? previewPage.value : 0
  const generated: VoucherPdfSlot[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const slot: VoucherPdfSlot = {
        page,
        x: toPt(grid.x + col * grid.dx),
        y: toPt(grid.y + row * grid.dy),
        size: toPt(grid.size),
        text: 'below',
        font_size: 9,
      }
      clampSlot(slot)
      generated.push(slot)
    }
  }
  layout.slots = [...layout.slots.filter(slot => slot.page !== page), ...generated].slice(0, MAX_LAYOUT_SLOTS)
  selected.value = layout.slots.indexOf(generated[0]!)
  nextTick(sampleSlots)
}

function slotStyle(slot: VoucherPdfSlot) {
  return {
    left: `${slot.x * scale.value}px`,
    top: `${slot.y * scale.value}px`,
    width: `${slot.size * scale.value}px`,
    height: `${slot.size * scale.value}px`,
  }
}

let drag: { index: number, mode: 'move' | 'resize', startX: number, startY: number, origin: VoucherPdfSlot } | null = null

function startDrag(event: PointerEvent, index: number, mode: 'move' | 'resize') {
  const slot = layout.slots[index]
  if (!slot) return
  selected.value = index
  drag = { index, mode, startX: event.clientX, startY: event.clientY, origin: { ...slot } }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag, { once: true })
}

function onDragMove(event: PointerEvent) {
  if (!drag) return
  const slot = layout.slots[drag.index]
  if (!slot) return
  const dx = (event.clientX - drag.startX) / scale.value
  const dy = (event.clientY - drag.startY) / scale.value
  if (drag.mode === 'move') {
    slot.x = drag.origin.x + dx
    slot.y = drag.origin.y + dy
  } else {
    // Kept square: the larger of both deltas wins.
    slot.size = drag.origin.size + Math.max(dx, dy)
  }
  clampSlot(slot)
}

function endDrag() {
  window.removeEventListener('pointermove', onDragMove)
  drag = null
  sampleSlots()
}

function onSlotKeydown(event: KeyboardEvent, index: number) {
  const slot = layout.slots[index]
  if (!slot) return
  const step = toPt(event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM)
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = moves[event.key]
  if (move) {
    event.preventDefault()
    slot.x += move[0]
    slot.y += move[1]
    clampSlot(slot)
    sampleSlots()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSlot()
  }
}

// --- Sample QR for the live preview -------------------------------------

const sampleCode = computed(() => codes.value[0] ?? 'K7M2Q9XRT4H')
const sampleCodeFormatted = computed(() => formatVoucherCode(sampleCode.value))
const sampleQr = shallowRef<{ size: number, cells: Array<[number, number]> }>({ size: 21, cells: [] })
const sampleQrTotal = computed(() => sampleQr.value.size + layout.quiet_zone * 2)
const sampleQrPath = computed(() => sampleQr.value.cells
  .map(([row, col]) => `M${col + layout.quiet_zone} ${row + layout.quiet_zone}h1v1h-1z`)
  .join(''))

watch(sampleCode, async (code) => {
  const qrcode: any = await import('qrcode')
  const QRCode = qrcode.default ?? qrcode
  const modules = QRCode.create(code, { errorCorrectionLevel: 'M' }).modules
  const cells: Array<[number, number]> = []
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) cells.push([row, col])
    }
  }
  sampleQr.value = { size: modules.size, cells }
}, { immediate: true })

// --- Warnings -----------------------------------------------------------

const placementWarnings = computed(() => {
  const list: string[] = []
  for (const [index, slot] of layout.slots.entries()) {
    if (slot.size < toPt(MIN_QR_MM)) list.push(t('vouchers.pdf.tooSmall', { number: fillNumber(index), min: MIN_QR_MM }))
  }
  if (layout.quiet_zone < DEFAULT_QR_QUIET_ZONE) list.push(t('vouchers.export.marginSmall'))
  if (layout.background_color !== null) return list

  for (const [index, sample] of slotSamples.value) {
    const number = fillNumber(index)
    if (contrastRatio(layout.qr_color, sample.color) < MIN_QR_CONTRAST) list.push(t('vouchers.pdf.lowContrastSlot', { number }))
    else if (isInverted(layout.qr_color, sample.color)) list.push(t('vouchers.pdf.invertedSlot', { number }))
    if (sample.deviation > MAX_CALM_DEVIATION) list.push(t('vouchers.pdf.busySlot', { number }))
  }
  return list
})

const plan = computed<VoucherPdfPlan | null>(() => sourceBoxes.value.length && layout.slots.length
  ? planVoucherPdf(layout, sourceBoxes.value.length, codes.value.length)
  : null)

const sourceProblem = computed(() => {
  if (!sourceBytes.value || !layout.slots.length) return null
  try {
    validateSourceBoxes(sourceBoxes.value, layout, codes.value.length)
    return null
  } catch (error) {
    return errorMessage(error)
  }
})

const canGenerate = computed(() => !sourceProblem.value && codes.value.length > 0 && layout.slots.length > 0)

const generateWarnings = computed(() => {
  const list = [...placementWarnings.value]
  if (sourceProblem.value) list.unshift(sourceProblem.value)
  if (layout.background_color !== null) {
    if (contrastRatio(layout.qr_color, layout.background_color) < MIN_QR_CONTRAST) list.push(t('vouchers.colors.lowContrast', { ratio: contrastRatio(layout.qr_color, layout.background_color).toFixed(1) }))
    if (isInverted(layout.qr_color, layout.background_color)) list.push(t('vouchers.colors.inverted'))
  }
  if (plan.value?.emptySlots) list.push(t('vouchers.pdf.emptySlots', { count: plan.value.emptySlots }))
  list.push(t('vouchers.pdf.testHint'))
  return list
})

// --- Save & generate ----------------------------------------------------

function currentLayout(): VoucherPdfLayout {
  const reference = sourceBoxes.value[0]
  return {
    ...JSON.parse(JSON.stringify(layout)),
    page_width: reference?.width ?? layout.page_width,
    page_height: reference?.height ?? layout.page_height,
  }
}

/** Compared in validated (normalized) form, so an untouched layout never counts as changed. */
const layoutIsSaved = computed(() => {
  if (!savedSnapshot.value) return false
  const validated = validateVoucherPdfLayout(currentLayout())
  return validated.ok && JSON.stringify(validated.layout) === savedSnapshot.value
})

async function saveLayout() {
  const validated = validateVoucherPdfLayout(currentLayout())
  if (!validated.ok) {
    toast.error(validated.error)
    return
  }
  savingLayout.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/batches/layout', { method: 'POST', body: { batch_id: props.batch.id, layout: validated.layout } })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    savedSnapshot.value = JSON.stringify(validated.layout)
    // What is on screen is now this batch's saved layout.
    layoutSource.value = OWN_LAYOUT
    sourceSnapshot.value = comparable(validated.layout)
    toast.success(t('vouchers.pdf.layoutSaved'))
    emit('layout-saved')
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    savingLayout.value = false
  }
}

function slug(value: string) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'charge'
}

async function generate(testPageOnly: boolean) {
  if (!sourceBytes.value || generating.value) return
  const validated = validateVoucherPdfLayout(currentLayout())
  if (!validated.ok) {
    toast.error(validated.error)
    return
  }

  generating.value = true
  progress.value = { done: 0, total: plan.value?.pages ?? 0 }
  try {
    const bytes = await generateVoucherPdf({
      source: sourceBytes.value.slice(0),
      layout: validated.layout,
      codes: codes.value,
      testPageOnly,
      onProgress: (done, total) => { progress.value = { done, total } },
    })
    const suffix = testPageOnly ? '-testseite' : ''
    saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `gutscheine-${slug(props.batch.name)}${suffix}.pdf`)
  } catch (error) {
    toast.error(errorMessage(error))
  } finally {
    generating.value = false
  }
}
</script>
