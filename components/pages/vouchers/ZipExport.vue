<template>
  <CommonModal
    :model-value="modelValue"
    :title="batch ? t('vouchers.export.zipTitle', { name: batch.name }) : ''"
    width-class="max-w-xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="text-sm text-base-600">{{ t('vouchers.export.zipText') }}</p>

    <div class="field">
      <label>{{ t('vouchers.export.selection') }}</label>
      <CommonSelectMenu v-model="status" :options="statusOptions" />
    </div>

    <VoucherColorFields
      v-model:qr-color="qrColor"
      v-model:background-color="backgroundColor"
      :transparent-hint="t('vouchers.colors.transparentStaticHint')"
    />

    <div class="flex items-start gap-4">
      <div class="field min-w-0 flex-1">
        <label>{{ t('vouchers.export.margin') }}</label>
        <div class="flex items-center gap-2">
          <input
            v-model.number="margin"
            type="number"
            min="0"
            :max="MAX_MARGIN"
            step="1"
            class="input w-24!"
            @change="clampMargin"
          />
          <span class="text-sm text-base-600">{{ t('vouchers.export.marginUnit') }}</span>
        </div>
        <span class="text-xs text-base-500">{{ t('vouchers.export.marginHelp') }}</span>
      </div>
      <figure class="shrink-0 text-center">
        <div class="preview-checker h-24 w-24 overflow-hidden rounded border border-base-200">
          <svg :viewBox="`0 0 ${previewTotal} ${previewTotal}`" class="block h-full w-full" shape-rendering="crispEdges">
            <rect v-if="backgroundColor" :width="previewTotal" :height="previewTotal" :fill="backgroundColor" />
            <path :d="previewPath" :fill="qrColor" />
          </svg>
        </div>
        <figcaption class="mt-1 text-xs text-base-500">{{ t('vouchers.export.preview') }}</figcaption>
      </figure>
    </div>
    <p v-if="validMargin < 4" class="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-900">{{ t('vouchers.export.marginSmall') }}</p>

    <p class="text-xs text-base-500">{{ t('vouchers.export.mergeHelp') }}</p>

    <template #footer>
      <button type="button" class="btn-secondary" @click="$emit('update:modelValue', false)">
        {{ t('actions.cancel') }}
      </button>
      <button type="button" class="btn-primary inline-flex items-center gap-2" :disabled="downloading" @click="download">
        <Icon
          :name="downloading ? 'material-symbols:progress-activity' : 'material-symbols:download-rounded'"
          class="h-4 w-4"
          :class="{ 'animate-spin': downloading }"
          aria-hidden="true"
        />
        {{ downloading ? t('vouchers.export.preparing') : t('vouchers.export.download') }}
      </button>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { downloadFromApi } from '~/composables/useFileDownload'
import { useExportStatusOptions } from '~/composables/useVoucherLabels'
import { DEFAULT_QR_QUIET_ZONE, MAX_QR_QUIET_ZONE } from '~/utils/voucherPdfLayout'

const props = defineProps<{
  modelValue: boolean
  batch: any | null
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const toast = useToast()
const statusOptions = useExportStatusOptions()

const MAX_MARGIN = MAX_QR_QUIET_ZONE
const DEFAULT_MARGIN = DEFAULT_QR_QUIET_ZONE
/** Any valid code works for the preview; all codes of a batch have the same QR version. */
const PREVIEW_CODE = 'K7M2Q9XRT4H'

const qrColor = ref('#000000')
const backgroundColor = ref<string | null>('#FFFFFF')
const status = ref('')
const downloading = ref(false)
const margin = ref<number | ''>(DEFAULT_MARGIN)
const previewModules = shallowRef<{ size: number, cells: Array<[number, number]> }>({ size: 21, cells: [] })

const validMargin = computed(() => {
  const value = Number(margin.value)
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), MAX_MARGIN) : DEFAULT_MARGIN
})

function clampMargin() {
  margin.value = validMargin.value
}

const previewTotal = computed(() => previewModules.value.size + validMargin.value * 2)
const previewPath = computed(() => previewModules.value.cells
  .map(([row, col]) => `M${col + validMargin.value} ${row + validMargin.value}h1v1h-1z`)
  .join(''))

onMounted(async () => {
  const qrcode: any = await import('qrcode')
  const QRCode = qrcode.default ?? qrcode
  const modules = QRCode.create(PREVIEW_CODE, { errorCorrectionLevel: 'M' }).modules
  const cells: Array<[number, number]> = []
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) cells.push([row, col])
    }
  }
  previewModules.value = { size: modules.size, cells }
})

watch(() => props.modelValue, (open) => {
  if (!open) return
  const layout = props.batch?.pdf_layout
  qrColor.value = layout?.qr_color ?? '#000000'
  backgroundColor.value = layout ? layout.background_color : '#FFFFFF'
  status.value = ''
  // Same border as the saved PDF layout, so both exports look alike.
  margin.value = Number.isInteger(layout?.quiet_zone) ? layout.quiet_zone : DEFAULT_MARGIN
}, { immediate: true })

async function download() {
  if (!props.batch || downloading.value) return

  const params = new URLSearchParams({
    qr_color: qrColor.value.slice(1),
    background_color: backgroundColor.value === null ? 'transparent' : backgroundColor.value.slice(1),
    margin: String(validMargin.value),
  })
  if (status.value) params.set('status', status.value)

  downloading.value = true
  try {
    const result = await downloadFromApi(`/api/vouchers/batches/${props.batch.id}/export.zip?${params}`, 'gutscheine.zip')
    if (!result.ok) toast.error(result.error || t('vouchers.export.failed'))
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
/* Shows through where the background is transparent. */
.preview-checker {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, var(--color-base-200) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-base-200) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-base-200) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-base-200) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}
</style>
