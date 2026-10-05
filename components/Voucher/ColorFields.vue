<template>
  <div class="space-y-3">
    <div class="grid grid-cols-1 gap-3" :class="stacked ? '' : showText ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
      <div class="field">
        <label>{{ t('vouchers.colors.qr') }}</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            class="h-9 w-10 shrink-0 cursor-pointer rounded border border-base-300 bg-white p-0.5"
            :value="qrColor"
            :aria-label="t('vouchers.colors.qr')"
            @input="qrColor = normalizeHexColor(($event.target as HTMLInputElement).value) ?? qrColor"
          />
          <input
            class="input font-mono uppercase"
            :value="qrDraft"
            maxlength="7"
            @input="qrDraft = ($event.target as HTMLInputElement).value"
            @change="commitHex('qr')"
          />
        </div>
      </div>

      <div class="field">
        <label>{{ t('vouchers.colors.background') }}</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            class="h-9 w-10 shrink-0 cursor-pointer rounded border border-base-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            :value="backgroundColor ?? lastBackground"
            :disabled="backgroundColor === null"
            :aria-label="t('vouchers.colors.background')"
            @input="backgroundColor = normalizeHexColor(($event.target as HTMLInputElement).value) ?? backgroundColor"
          />
          <input
            class="input font-mono uppercase"
            :value="backgroundColor === null ? '' : backgroundDraft"
            :placeholder="backgroundColor === null ? t('vouchers.colors.transparent') : ''"
            :disabled="backgroundColor === null"
            maxlength="7"
            @input="backgroundDraft = ($event.target as HTMLInputElement).value"
            @change="commitHex('background')"
          />
        </div>
        <label class="mt-1 flex cursor-pointer items-center gap-2 text-xs! text-base-700!">
          <input type="checkbox" class="checkbox" :checked="backgroundColor === null" @change="toggleTransparent" />
          {{ t('vouchers.colors.transparent') }}
        </label>
      </div>

      <div v-if="showText" class="field">
        <label>{{ t('vouchers.colors.text') }}</label>
        <div class="flex items-center gap-2">
          <input
            type="color"
            class="h-9 w-10 shrink-0 cursor-pointer rounded border border-base-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            :value="textColor ?? qrColor"
            :disabled="textColor === null"
            :aria-label="t('vouchers.colors.text')"
            @input="textColor = normalizeHexColor(($event.target as HTMLInputElement).value) ?? textColor"
          />
          <input
            class="input font-mono uppercase"
            :value="textColor === null ? '' : textDraft"
            :placeholder="textColor === null ? t('vouchers.colors.sameAsQr') : ''"
            :disabled="textColor === null"
            maxlength="7"
            @input="textDraft = ($event.target as HTMLInputElement).value"
            @change="commitHex('text')"
          />
        </div>
        <label class="mt-1 flex cursor-pointer items-center gap-2 text-xs! text-base-700!">
          <input type="checkbox" class="checkbox" :checked="textColor === null" @change="textColor = textColor === null ? qrColor : null" />
          {{ t('vouchers.colors.sameAsQr') }}
        </label>
      </div>
    </div>

    <ul v-if="warnings.length" class="space-y-1">
      <li
        v-for="warning in warnings"
        :key="warning"
        class="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-900"
      >
        <Icon name="material-symbols:warning-outline-rounded" class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {{ warning }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { contrastRatio, isInverted, MIN_QR_CONTRAST, normalizeHexColor } from '~/utils/voucherColors'

const props = withDefaults(defineProps<{
  showText?: boolean
  /** One field per row, for narrow side panels. */
  stacked?: boolean
  /** Shown instead of the contrast check while the background is transparent (no design to compare against). */
  transparentHint?: string
}>(), {
  showText: false,
  stacked: false,
  transparentHint: '',
})

const qrColor = defineModel<string>('qrColor', { default: '#000000' })
/** null = transparent. */
const backgroundColor = defineModel<string | null>('backgroundColor', { default: '#FFFFFF' })
/** null = same as the QR colour. */
const textColor = defineModel<string | null>('textColor', { default: null })

const { t } = useI18n()

const qrDraft = ref(qrColor.value)
const backgroundDraft = ref(backgroundColor.value ?? '#FFFFFF')
const textDraft = ref(textColor.value ?? qrColor.value)
const lastBackground = ref(backgroundColor.value ?? '#FFFFFF')

watch(qrColor, value => { qrDraft.value = value })
watch(backgroundColor, (value) => {
  if (value) {
    backgroundDraft.value = value
    lastBackground.value = value
  }
})
watch(textColor, value => { if (value) textDraft.value = value })

function commitHex(target: 'qr' | 'background' | 'text') {
  if (target === 'qr') {
    const value = normalizeHexColor(qrDraft.value)
    if (value) qrColor.value = value
    qrDraft.value = qrColor.value
  } else if (target === 'background') {
    const value = normalizeHexColor(backgroundDraft.value)
    if (value) backgroundColor.value = value
    backgroundDraft.value = backgroundColor.value ?? lastBackground.value
  } else {
    const value = normalizeHexColor(textDraft.value)
    if (value) textColor.value = value
    textDraft.value = textColor.value ?? qrColor.value
  }
}

function toggleTransparent() {
  backgroundColor.value = backgroundColor.value === null ? lastBackground.value : null
}

const warnings = computed(() => {
  const list: string[] = []
  if (backgroundColor.value === null) {
    if (props.transparentHint) list.push(props.transparentHint)
    return list
  }

  if (contrastRatio(qrColor.value, backgroundColor.value) < MIN_QR_CONTRAST) {
    list.push(t('vouchers.colors.lowContrast', { ratio: contrastRatio(qrColor.value, backgroundColor.value).toFixed(1) }))
  }
  if (isInverted(qrColor.value, backgroundColor.value)) list.push(t('vouchers.colors.inverted'))
  return list
})
</script>
