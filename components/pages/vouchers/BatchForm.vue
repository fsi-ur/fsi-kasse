<template>
  <CommonModal
    :model-value="modelValue"
    :title="batch ? t('vouchers.batches.editTitle', { name: batch.name }) : t('vouchers.batches.new')"
    width-class="max-w-xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <CommonValidationSummary :errors="errors" :title="t('vouchers.form.invalid')" />

    <div class="field">
      <label>{{ t('common.name') }}</label>
      <input v-model="form.name" class="input" maxlength="255" :placeholder="t('vouchers.form.namePlaceholder')" />
    </div>

    <div class="field">
      <label>{{ t('vouchers.form.kind') }}</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="kind in (['free', 'paid'] as const)"
          :key="kind"
          type="button"
          class="rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="[
            form.kind === kind ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-base-300 bg-white text-base-700',
            batch ? 'cursor-not-allowed opacity-70' : form.kind === kind ? 'cursor-default' : 'cursor-pointer hover:bg-base-50',
          ]"
          :disabled="!!batch"
          @click="form.kind = kind"
        >
          <span class="block font-semibold">{{ kindLabel(kind) }}</span>
          <span class="block text-xs text-base-500">{{ t(kind === 'paid' ? 'vouchers.form.kindPaidHint' : 'vouchers.form.kindFreeHint') }}</span>
        </button>
      </div>
    </div>

    <div class="field">
      <label>{{ t('vouchers.form.itemGroup') }}</label>
      <CommonSearchSelect
        v-model="groupQuery"
        :options="groupOptions"
        :placeholder="t('vouchers.form.itemGroupPlaceholder')"
        :empty-text="t('vouchers.form.noItemGroups')"
        :selected-label="selectedGroupLabel"
        :disabled="!!batch"
        @select="form.item_group_id = Number($event); groupQuery = ''"
        @clear-selection="form.item_group_id = null"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="field">
        <label>{{ t('vouchers.form.units') }}</label>
        <input v-model.number="form.units_per_voucher" type="number" min="1" max="999" step="1" class="input" :disabled="!!batch" />
      </div>
      <div v-if="form.kind === 'paid'" class="field">
        <label>{{ t('vouchers.form.salePrice') }}</label>
        <input
          :value="priceRaw"
          type="text"
          inputmode="decimal"
          class="input"
          placeholder="0.00"
          :disabled="priceLocked"
          @input="onPriceInput"
        />
      </div>
    </div>
    <p v-if="priceLocked" class="-mt-2 text-xs text-base-500">{{ t('vouchers.form.priceLocked') }}</p>

    <label class="flex items-start gap-2 text-sm" :class="batch ? 'opacity-70' : 'cursor-pointer'">
      <input v-model="form.includes_deposit" type="checkbox" class="checkbox mt-0.5" :disabled="!!batch" />
      <span>
        {{ t('vouchers.form.includesDeposit') }}
        <span class="block text-xs text-base-500">{{ t('vouchers.form.includesDepositHint') }}</span>
      </span>
    </label>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="field">
        <label>{{ t('vouchers.form.event') }}</label>
        <CommonSearchSelect
          v-model="eventQuery"
          :options="eventOptions"
          :placeholder="t('vouchers.form.anyEvent')"
          :empty-text="t('select.noEvents')"
          :selected-label="selectedEventLabel"
          @select="form.event_id = $event == null ? null : Number($event); eventQuery = ''"
          @clear-selection="form.event_id = null"
        />
      </div>
      <div class="field">
        <label>{{ t('vouchers.form.validUntil') }}</label>
        <CommonDateInput
          :model-value="form.valid_until"
          mode="date"
          :empty-value="null"
          :placeholder="t('vouchers.form.noExpiry')"
          @update:model-value="form.valid_until = $event"
        />
      </div>
    </div>

    <div v-if="!batch" class="field">
      <label>{{ t('vouchers.form.count') }}</label>
      <input v-model.number="form.count" type="number" min="1" :max="MAX_VOUCHERS_PER_BATCH" step="1" class="input" />
    </div>

    <div class="field">
      <label>{{ t('vouchers.form.note') }}</label>
      <textarea v-model="form.note" class="input" rows="2" maxlength="1000" />
    </div>

    <p v-if="batch" class="text-xs text-base-500">{{ t('vouchers.form.immutableHint') }}</p>

    <template #footer>
      <CommonFormActions
        class="w-full"
        :saving="saving"
        :cancel-label="t('actions.cancel')"
        :submit-label="batch ? t('actions.save') : t('vouchers.form.create')"
        @cancel="$emit('update:modelValue', false)"
        @submit="submit"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useVoucherLabels } from '~/composables/useVoucherLabels'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { parseCurrencyInput, sanitizeCurrencyInput } from '~/composables/useCurrencyInput'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

// Mirrors MAX_VOUCHERS_PER_BATCH on the server.
const MAX_VOUCHERS_PER_BATCH = 2000

const props = defineProps<{
  modelValue: boolean
  /** A row of /api/vouchers/batches when editing, null when creating. */
  batch: any | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', payload: { id: number, created: boolean }): void
}>()

const { t } = useI18n()
const toast = useToast()
const { kindLabel } = useVoucherLabels()
const { formatLocalDate } = useLocaleFormatters()

interface BatchForm {
  name: string
  kind: 'paid' | 'free'
  item_group_id: number | null
  units_per_voucher: number
  includes_deposit: boolean
  event_id: number | null
  valid_until: string | null
  note: string
  count: number
}

const form = reactive<BatchForm>(emptyForm())
const priceRaw = ref('')
const groupQuery = ref('')
const eventQuery = ref('')
const groups = ref<any[]>([])
const events = ref<any[]>([])
const saving = ref(false)
const submitted = ref(false)

function emptyForm(): BatchForm {
  return { name: '', kind: 'free', item_group_id: null, units_per_voucher: 1, includes_deposit: true, event_id: null, valid_until: null, note: '', count: 50 }
}

const priceLocked = computed(() => Boolean(props.batch?.in_use) && form.kind === 'paid')

watch(() => props.modelValue, (open) => {
  if (!open) return
  submitted.value = false
  groupQuery.value = ''
  eventQuery.value = ''
  const batch = props.batch
  Object.assign(form, batch
    ? {
        name: batch.name,
        kind: batch.kind,
        item_group_id: batch.item_group_id,
        units_per_voucher: batch.units_per_voucher,
        includes_deposit: batch.includes_deposit,
        event_id: batch.event_id,
        valid_until: batch.valid_until ? String(batch.valid_until).slice(0, 10) : null,
        note: batch.note ?? '',
        count: 0,
      }
    : emptyForm())
  priceRaw.value = batch?.sale_price != null ? Number(batch.sale_price).toFixed(2) : ''
  loadOptions()
}, { immediate: true })

async function loadOptions() {
  try {
    const [groupRes, eventRes] = await Promise.all([
      $fetch<any>('/api/item-groups'),
      $fetch<any>('/api/events'),
    ])
    if (groupRes.ok) groups.value = groupRes.groups
    if (eventRes.ok) events.value = eventRes.events
  } catch {
    toast.error(t('common.unknownError'))
  }
}

const groupOptions = computed<SearchSelectOption[]>(() => groups.value
  .filter(group => group.is_active || group.id === form.item_group_id)
  .map(group => ({
    key: group.id,
    label: t('vouchers.form.itemGroupOption', { name: group.name, count: group.item_ids.length }),
    value: group.id,
  })))

const selectedGroupLabel = computed(() => groupOptions.value.find(option => option.value === form.item_group_id)?.label
  ?? props.batch?.item_group_name ?? '')

const eventOptions = computed<SearchSelectOption[]>(() => [
  { key: 'none', label: t('vouchers.form.anyEvent'), value: null },
  ...events.value
    .filter(entry => entry.is_active || entry.id === form.event_id)
    .map(entry => ({
      key: entry.id,
      label: `${entry.name} | ${formatLocalDate(entry.starts_at)}`,
      value: entry.id,
    })),
])

const selectedEventLabel = computed(() => form.event_id == null
  ? ''
  : eventOptions.value.find(option => option.value === form.event_id)?.label ?? props.batch?.event_name ?? '')

function onPriceInput(event: Event) {
  const raw = sanitizeCurrencyInput((event.target as HTMLInputElement).value)
  priceRaw.value = raw
  ;(event.target as HTMLInputElement).value = raw
}

const salePrice = computed(() => Math.round(parseCurrencyInput(priceRaw.value) * 100) / 100)

const errors = computed(() => {
  if (!submitted.value) return []
  const list: string[] = []
  if (!form.name.trim()) list.push(t('vouchers.form.errors.name'))
  if (!form.item_group_id) list.push(t('vouchers.form.errors.itemGroup'))
  if (!Number.isInteger(form.units_per_voucher) || form.units_per_voucher < 1 || form.units_per_voucher > 999) {
    list.push(t('vouchers.form.errors.units'))
  }
  if (form.kind === 'paid' && !(salePrice.value > 0)) list.push(t('vouchers.form.errors.price'))
  if (!props.batch && (!Number.isInteger(form.count) || form.count < 1 || form.count > MAX_VOUCHERS_PER_BATCH)) {
    list.push(t('vouchers.form.errors.count', { max: MAX_VOUCHERS_PER_BATCH }))
  }
  return list
})

async function submit() {
  submitted.value = true
  if (errors.value.length || saving.value) return

  saving.value = true
  try {
    const common = {
      name: form.name.trim(),
      note: form.note.trim() || null,
      event_id: form.event_id,
      valid_until: form.valid_until,
      ...(form.kind === 'paid' ? { sale_price: salePrice.value } : {}),
    }
    const res = props.batch
      ? await $fetch<any>('/api/vouchers/batches/update', { method: 'POST', body: { id: props.batch.id, ...common } })
      : await $fetch<any>('/api/vouchers/batches/create', {
          method: 'POST',
          body: {
            ...common,
            kind: form.kind,
            item_group_id: form.item_group_id,
            units_per_voucher: form.units_per_voucher,
            includes_deposit: form.includes_deposit,
            count: form.count,
          },
        })

    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }

    toast.success(t('common.saved'))
    emit('update:modelValue', false)
    emit('saved', { id: props.batch?.id ?? res.id, created: !props.batch })
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    saving.value = false
  }
}
</script>
