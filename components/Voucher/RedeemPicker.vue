<template>
  <CommonModal
    :model-value="modelValue"
    :title="voucher ? t('vouchers.redeem.title', { code: voucher.code_formatted }) : ''"
    width-class="max-w-lg"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="voucher" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span class="text-base-600">{{ voucher.batch.name }} · {{ voucher.batch.item_group_name }}</span>
      <span class="font-semibold" :class="used > available ? 'text-danger-600' : ''">
        {{ t('vouchers.redeem.unitsUsed', { used, available }) }}
      </span>
    </div>
    <p v-if="voucher" class="text-xs text-base-500">
      {{ voucher.batch.includes_deposit ? t('vouchers.redeem.depositIncluded') : t('vouchers.redeem.depositExtra') }}
    </p>

    <p v-if="!rows.length" class="text-sm text-base-500">{{ t('vouchers.redeem.noItems') }}</p>

    <ul class="divide-y divide-base-100">
      <li v-for="row in visibleRows" :key="row.id" class="flex items-center gap-3 py-2">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ row.name }}</p>
          <p class="text-xs text-base-500">
            {{ formatCurrency(row.price) }}<template v-if="row.deposit > 0"> {{ t('checkout.depositSuffix', { amount: formatCurrency(row.deposit) }) }}</template>
            <template v-if="row.inCart > 0"> · {{ t('vouchers.redeem.inCart', { count: row.inCart }) }}</template>
          </p>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0!"
            :aria-label="t('orderChanges.decrease')"
            :disabled="!picked[row.id]"
            @click="change(row.id, -1)"
          >
            <Icon name="material-symbols:remove-rounded" class="block h-5 w-5" aria-hidden="true" />
          </button>
          <span class="w-8 text-center font-semibold">{{ picked[row.id] ?? 0 }}</span>
          <button
            type="button"
            class="btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0!"
            :aria-label="t('orderChanges.increase')"
            :disabled="used >= available"
            @click="change(row.id, 1)"
          >
            <Icon name="material-symbols:add-rounded" class="block h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <button
      v-if="hiddenCount > 0 || showAll"
      type="button"
      class="text-sm text-link-600 hover:underline cursor-pointer"
      @click="showAll = !showAll"
    >
      {{ showAll ? t('vouchers.redeem.onlyStand') : t('vouchers.redeem.showAll', { count: hiddenCount }) }}
    </button>

    <p v-if="convertedCount > 0" class="rounded-lg bg-info-50 px-3 py-2 text-xs text-info-900">
      {{ t('vouchers.redeem.converted', { count: convertedCount }) }}
    </p>

    <template #footer>
      <CommonFormActions
        class="w-full"
        :cancel-label="t('actions.cancel')"
        :submit-label="t('vouchers.redeem.confirm', { count: used })"
        :save-disabled="used > available || !hasChanges"
        @cancel="$emit('update:modelValue', false)"
        @submit="confirm"
      />
    </template>
  </CommonModal>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'

interface PickerItem {
  id: number
  name: string
  price: number
  deposit: number
}

const props = defineProps<{
  modelValue: boolean
  /** `voucher` of /api/vouchers/lookup. */
  voucher: any | null
  /** Units this voucher can still give in this cart (remaining, or all if it is sold in this cart). */
  available: number
  /** Active items the till sells. */
  items: PickerItem[]
  /** Items of the selected stand — listed first, the rest behind a toggle. */
  standItemIds: number[] | null
  /** Units of each item already redeemed with this voucher in the cart. */
  redeemed: Record<number, number>
  /** Units of each item in the cart as normal, paid lines. */
  paid: Record<number, number>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** Units of each item to redeem with this voucher (replaces its current lines). */
  (e: 'confirm', picked: Record<number, number>): void
}>()

const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()

const picked = ref<Record<number, number>>({})
const showAll = ref(false)

const rows = computed(() => {
  const allowed = new Set<number>(props.voucher?.allowed_item_ids ?? [])
  return props.items
    .filter(item => allowed.has(item.id))
    .map(item => ({ ...item, inCart: props.paid[item.id] ?? 0 }))
})

const standIds = computed(() => props.standItemIds ? new Set(props.standItemIds) : null)
const visibleRows = computed(() => {
  if (!standIds.value || showAll.value) {
    return [...rows.value].sort((a, b) => Number(standIds.value?.has(b.id) ?? 0) - Number(standIds.value?.has(a.id) ?? 0))
  }
  return rows.value.filter(row => standIds.value!.has(row.id) || (picked.value[row.id] ?? 0) > 0)
})
const hiddenCount = computed(() => rows.value.length - visibleRows.value.length)

const used = computed(() => Object.values(picked.value).reduce((sum, count) => sum + count, 0))
const hasChanges = computed(() => {
  const ids = new Set([...Object.keys(picked.value), ...Object.keys(props.redeemed)].map(Number))
  return [...ids].some(id => (picked.value[id] ?? 0) !== (props.redeemed[id] ?? 0))
})

/** Paid units that will be turned into redemptions on confirm. */
const convertedCount = computed(() => rows.value.reduce((sum, row) => {
  const added = Math.max(0, (picked.value[row.id] ?? 0) - (props.redeemed[row.id] ?? 0))
  return sum + Math.min(added, row.inCart)
}, 0))

watch(() => props.modelValue, (open) => {
  if (!open) return
  showAll.value = false
  const start: Record<number, number> = { ...props.redeemed }
  // Nothing picked yet: suggest the matching items that are already in the cart.
  if (!Object.values(start).some(count => count > 0)) {
    let left = props.available
    for (const row of rows.value) {
      const take = Math.min(row.inCart, left)
      if (take > 0) start[row.id] = take
      left -= take
    }
  }
  picked.value = start
}, { immediate: true })

function change(id: number, delta: number) {
  const next = Math.max(0, (picked.value[id] ?? 0) + delta)
  if (delta > 0 && used.value >= props.available) return
  picked.value = { ...picked.value, [id]: next }
}

function confirm() {
  if (used.value > props.available) return
  emit('confirm', Object.fromEntries(Object.entries(picked.value).filter(([, count]) => count > 0)))
  emit('update:modelValue', false)
}
</script>
