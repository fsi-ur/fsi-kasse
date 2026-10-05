<template>
  <CommonModal
    :model-value="modelValue"
    :title="title"
    width-class="max-w-lg"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p v-if="!isOnline" class="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">
      <Icon name="material-symbols:cloud-off-outline-rounded" class="h-5 w-5 shrink-0" aria-hidden="true" />
      {{ t('vouchers.offlineBlocked') }}
    </p>

    <template v-if="!result && !initialCode">
      <CommonQrScanner :active="modelValue && isOnline && !looking" @detected="lookup" />

      <form class="flex gap-2" @submit.prevent="lookup(manualCode)">
        <input
          v-model="manualCode"
          class="input font-mono uppercase"
          :placeholder="t('vouchers.scan.manualPlaceholder')"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          :disabled="!isOnline"
        />
        <button type="submit" class="btn-primary shrink-0" :disabled="!isOnline || !manualCode.trim() || looking">
          {{ t('vouchers.scan.check') }}
        </button>
      </form>
      <p v-if="codeError" class="text-sm text-danger-600">{{ codeError }}</p>
    </template>

    <p v-if="looking" class="text-sm text-base-500">{{ t('common.loading') }}</p>

    <template v-if="result">
      <VoucherCard :voucher="result.voucher" />

      <p
        v-if="context !== 'check' && result.action === 'none'"
        class="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-900"
      >
        {{ result.reason ?? t('vouchers.scan.notUsable') }}
      </p>
      <p v-else-if="context !== 'check' && blockedHint" class="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">
        {{ blockedHint }}
      </p>

      <div v-if="context === 'check' && canManage && revoking" class="space-y-2">
        <label class="section-title block" for="voucher-revoke-reason">{{ t('vouchers.scan.revokeReason') }}</label>
        <textarea id="voucher-revoke-reason" v-model="revokeReason" class="input" rows="2" maxlength="1000" />
      </div>
    </template>

    <template #footer>
      <button type="button" class="btn-secondary mr-auto" @click="$emit('update:modelValue', false)">{{ t('actions.close') }}</button>
      <button v-if="result && !initialCode" type="button" class="btn-secondary" @click="reset">{{ t('vouchers.scan.again') }}</button>

      <template v-if="result && context === 'check' && canManage">
        <button v-if="result.voucher.status === 'revoked'" type="button" class="btn-outline" :disabled="busy || !isOnline" @click="unrevoke">
          {{ t('vouchers.scan.unrevoke') }}
        </button>
        <button v-else-if="!revoking" type="button" class="btn-outline text-danger-700! border-danger-500!" :disabled="!isOnline" @click="revoking = true">
          {{ t('vouchers.scan.revoke') }}
        </button>
        <button v-else type="button" class="btn-primary bg-danger-600!" :disabled="busy || !revokeReason.trim() || !isOnline" @click="revoke">
          {{ t('vouchers.scan.confirmRevoke') }}
        </button>
      </template>

      <template v-if="result && context !== 'check' && !blockedHint">
        <button v-if="result.action === 'sell'" type="button" class="btn-primary" :disabled="!isOnline" @click="$emit('sell', result)">
          {{ t('vouchers.scan.sell', { price: formatCurrency(result.voucher.batch.sale_price) }) }}
        </button>
        <button v-else-if="result.action === 'redeem'" type="button" class="btn-primary" :disabled="!isOnline" @click="$emit('redeem', result)">
          {{ t('vouchers.scan.redeem') }}
        </button>
      </template>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useConnectivity } from '~/composables/useConnectivity'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { normalizeVoucherCode } from '~/utils/voucherCode'

const props = withDefaults(defineProps<{
  modelValue: boolean
  /** checkout: sell/redeem into the cart; orderChange: into a change request; check: inspect, revoke. */
  context: 'checkout' | 'orderChange' | 'check'
  eventId?: number | null
  /** orderChange: validity is checked as of this order. */
  orderId?: number | null
  /** Skips the scanner and looks this code up directly (detail view of a list row). */
  initialCode?: string | null
  /** Shown instead of the action buttons, e.g. while the cart is a Fachschaft order. */
  blockedHint?: string | null
}>(), {
  eventId: null,
  orderId: null,
  initialCode: null,
  blockedHint: null,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'sell', result: any): void
  (e: 'redeem', result: any): void
  (e: 'changed'): void
}>()

const { t } = useI18n()
const toast = useToast()
const { isOnline } = useConnectivity()
const { formatCurrency } = useLocaleFormatters()
const { hasPermission } = useAuth()

const manualCode = ref('')
const codeError = ref<string | null>(null)
const looking = ref(false)
const busy = ref(false)
const result = ref<any | null>(null)
const revoking = ref(false)
const revokeReason = ref('')

const canManage = computed(() => hasPermission('cash_register.manage'))
const title = computed(() => props.context === 'check' ? t('vouchers.check.title') : t('vouchers.scan.title'))

function reset() {
  result.value = null
  manualCode.value = ''
  codeError.value = null
  revoking.value = false
  revokeReason.value = ''
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  reset()
  if (props.initialCode) lookup(props.initialCode)
}, { immediate: true })

const CODE_ERRORS: Record<string, string> = {
  empty: 'vouchers.errors.emptyCode',
  characters: 'vouchers.errors.invalidCharacters',
  length: 'vouchers.errors.invalidLength',
  checksum: 'vouchers.errors.invalidCode',
}

async function lookup(raw: string) {
  if (looking.value) return
  // Typos are caught locally by the check character, before any server call.
  const normalized = normalizeVoucherCode(raw)
  if (!normalized.ok) {
    codeError.value = t(CODE_ERRORS[normalized.reason] ?? 'vouchers.errors.invalidCode')
    return
  }
  codeError.value = null

  looking.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/lookup', {
      method: 'POST',
      body: { code: normalized.code, event_id: props.eventId, order_id: props.orderId },
    })
    if (!res.ok) {
      codeError.value = res.error || t('common.unknownError')
      if (props.initialCode) toast.error(codeError.value!)
      return
    }
    result.value = res
  } catch {
    codeError.value = t('common.unknownError')
  } finally {
    looking.value = false
  }
}

async function reload() {
  const code = result.value?.voucher?.code
  result.value = null
  if (code) await lookup(code)
}

async function revoke() {
  if (!result.value || busy.value) return
  busy.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/revoke', { method: 'POST', body: { id: result.value.voucher.id, reason: revokeReason.value.trim() } })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    toast.success(t('vouchers.scan.revoked'))
    revoking.value = false
    revokeReason.value = ''
    emit('changed')
    await reload()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    busy.value = false
  }
}

async function unrevoke() {
  if (!result.value || busy.value) return
  busy.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/unrevoke', { method: 'POST', body: { id: result.value.voucher.id } })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    toast.success(t('vouchers.scan.unrevoked'))
    emit('changed')
    await reload()
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    busy.value = false
  }
}

defineExpose({ reset })
</script>
