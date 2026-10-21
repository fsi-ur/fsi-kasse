<template>
  <CommonModal
    :model-value="active?.kind === kind"
    :title="title"
    :close-on-backdrop="false"
    :close-on-escape="false"
  >
    <template v-if="phase === 'waiting'">
      <div class="flex flex-col items-center gap-2 py-2 text-center">
        <Icon name="material-symbols:contactless-outline" class="h-12 w-12 text-accent-600" aria-hidden="true" />
        <p class="text-2xl font-bold text-base-900">{{ formatCurrency(active!.amount) }}</p>
        <p class="text-base text-base-700">{{ t('card.modal.presentCard') }}</p>
        <p v-if="terminalLabel" class="text-sm text-base-500">{{ terminalLabel }}</p>
        <div v-if="unclear" class="mt-2 w-full rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-900">
          {{ t('card.modal.unclear') }}
        </div>
        <Icon
          v-else
          name="material-symbols:progress-activity"
          class="mt-2 h-6 w-6 animate-spin text-base-400"
          aria-hidden="true"
        />
      </div>
    </template>

    <template v-else-if="phase === 'failed'">
      <div class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-900">
        <p class="font-semibold">{{ t('card.modal.failedTitle') }}</p>
        <p>{{ payment?.failure_reason || t('common.unknownError') }}</p>
      </div>
    </template>

    <template v-else-if="phase === 'booking_failed'">
      <div class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-900 space-y-1">
        <p class="font-semibold">{{ t('card.modal.bookingFailedTitle') }}</p>
        <p>{{ t('card.modal.bookingFailedText', { error: payment?.booking_error || t('common.unknownError') }) }}</p>
      </div>
      <p class="text-sm text-base-600">{{ t('card.modal.bookingFailedHint') }}</p>
    </template>

    <template v-else-if="phase === 'resolved'">
      <p class="text-sm text-base-600">{{ t('card.modal.resolved') }}</p>
    </template>

    <template #footer>
      <div class="grid w-full gap-2 sm:auto-cols-fr sm:grid-flow-col">
        <template v-if="phase === 'waiting'">
          <button v-if="unclear" type="button" class="btn-secondary" :disabled="busy" @click="onRecheck">
            {{ t('card.modal.recheck') }}
          </button>
          <button type="button" class="btn-outline" :disabled="busy" @click="onCancel">
            {{ t('actions.cancel') }}
          </button>
        </template>

        <template v-else-if="phase === 'failed'">
          <button type="button" class="btn-outline" @click="$emit('back')">{{ backLabel }}</button>
          <button type="button" class="btn-secondary" @click="$emit('payCash')">{{ t('card.modal.payCash') }}</button>
          <button type="button" class="btn-primary" @click="$emit('retryCard')">{{ t('card.modal.retryCard') }}</button>
        </template>

        <button v-else type="button" class="btn-primary" @click="$emit('acknowledge')">
          {{ t('actions.confirm') }}
        </button>
      </div>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useCardPayment } from '~/composables/useCardPayment'

defineProps<{
  /** The page's payment kind; the modal only shows that kind's payment. */
  kind: 'checkout' | 'fachschaft_payment'
  /** Label of the "give up" button on failure ("Zurück zum Warenkorb"). */
  backLabel: string
}>()

defineEmits<{
  (e: 'retryCard'): void
  (e: 'payCash'): void
  (e: 'back'): void
  /** booking_failed / resolved: the cashier has read the message. */
  (e: 'acknowledge'): void
}>()

const { t } = useI18n()
const toast = useToast()
const { formatCurrency } = useLocaleFormatters()
const { active, payment, unclear, cancel, recheck } = useCardPayment()

const busy = ref(false)

/** booked is handled (and dismissed) by the page, so it never shows here. */
const phase = computed(() => {
  const status = payment.value?.status
  if (status === 'failed') return 'failed'
  if (status === 'booking_failed') return 'booking_failed'
  if (status === 'resolved') return 'resolved'
  return 'waiting'
})

const title = computed(() => {
  if (phase.value === 'failed') return t('card.modal.failedHeadline')
  if (phase.value === 'booking_failed') return t('card.modal.bookingFailedHeadline')
  return t('card.modal.title')
})

const terminalLabel = computed(() => [active.value?.standName, active.value?.readerName].filter(Boolean).join(' · '))

async function onCancel() {
  busy.value = true
  try {
    const error = await cancel()
    if (error) toast.error(error)
    else toast.info(t('card.modal.cancelRequested'))
  } finally {
    busy.value = false
  }
}

async function onRecheck() {
  busy.value = true
  try {
    await recheck()
  } finally {
    busy.value = false
  }
}
</script>
