<template>
  <CommonModal
    :model-value="modelValue"
    :title="batch ? t('vouchers.batches.revokeTitle', { name: batch.name }) : ''"
    width-class="max-w-lg"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="text-sm text-base-600">{{ t('vouchers.batches.revokeText') }}</p>

    <fieldset class="field">
      <label>{{ t('vouchers.batches.revokeStatuses') }}</label>
      <div class="space-y-1">
        <label
          v-for="option in options"
          :key="option.status"
          class="flex items-center gap-2 text-sm! text-base-800!"
          :class="option.count ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'"
        >
          <input
            v-model="selected"
            type="checkbox"
            class="checkbox"
            :value="option.status"
            :disabled="!option.count"
          />
          <span class="flex-1">{{ statusLabel(option.status) }}</span>
          <span class="text-base-500">{{ option.count }}</span>
        </label>
      </div>
    </fieldset>

    <div class="field">
      <label>{{ t('vouchers.scan.revokeReason') }}</label>
      <textarea v-model="reason" class="input" rows="2" maxlength="1000" />
    </div>

    <p class="text-xs text-base-500">{{ t('vouchers.batches.revokeHint') }}</p>

    <template #footer>
      <button type="button" class="btn-secondary" @click="$emit('update:modelValue', false)">{{ t('actions.cancel') }}</button>
      <button
        type="button"
        class="rounded-lg py-2 px-4 text-sm text-white bg-danger-600 hover:bg-danger-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="saving || !count || !reason.trim()"
        @click="submit"
      >
        {{ t('vouchers.batches.revokeSubmit', { count }) }}
      </button>
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useVoucherLabels, type VoucherDisplayStatus } from '~/composables/useVoucherLabels'

type RevocableStatus = Exclude<VoucherDisplayStatus, 'revoked'>

const props = defineProps<{
  modelValue: boolean
  /** A row of /api/vouchers/batches. */
  batch: any | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'revoked'): void
}>()

const { t } = useI18n()
const toast = useToast()
const { statusLabel } = useVoucherLabels()

const selected = ref<RevocableStatus[]>([])
const reason = ref('')
const saving = ref(false)

const options = computed(() => (['unsold', 'active', 'used_up'] as RevocableStatus[])
  .filter(status => status !== 'unsold' || props.batch?.kind === 'paid')
  .map(status => ({ status, count: Number(props.batch?.[status] ?? 0) })))

const count = computed(() => options.value
  .filter(option => selected.value.includes(option.status))
  .reduce((sum, option) => sum + option.count, 0))

watch(() => props.modelValue, (open) => {
  if (!open) return
  // Default: everything still usable; used-up vouchers can't be used anyway.
  selected.value = options.value.filter(option => option.count && option.status !== 'used_up').map(option => option.status)
  reason.value = ''
}, { immediate: true })

async function submit() {
  if (!props.batch || saving.value || !count.value) return
  saving.value = true
  try {
    const res = await $fetch<any>('/api/vouchers/batches/revoke', {
      method: 'POST',
      body: { batch_id: props.batch.id, statuses: selected.value, reason: reason.value.trim() },
    })
    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }
    toast.success(t('vouchers.batches.revokedCount', { count: res.count }))
    emit('update:modelValue', false)
    emit('revoked')
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    saving.value = false
  }
}
</script>
