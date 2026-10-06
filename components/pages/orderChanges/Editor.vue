<template>
  <CommonModal
    :model-value="modelValue"
    :title="order ? t('orderChanges.requestTitle', { id: order.id }) : ''"
    width-class="max-w-xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="text-sm text-base-600">{{ t('orderChanges.requestHint') }}</p>

    <CommonOfflineNotice v-if="!isOnline" variant="unavailable" />

    <ul>
      <li
        v-for="line in lines"
        :key="line.key"
        class="grid grid-cols-6 items-center gap-2 py-2 border-b border-base-200"
      >
        <span class="col-span-2 flex items-center gap-1">
          <button
            type="button"
            class="btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0!"
            :aria-label="t('orderChanges.decrease')"
            :disabled="line.quantity === 0"
            @click="changeQuantity(line, -1)"
          >
            <Icon name="material-symbols:remove-rounded" class="block h-5 w-5" aria-hidden="true" />
          </button>
          <span class="w-8 text-center" :class="{ 'font-semibold': line.quantity !== line.originalQuantity }">
            {{ line.quantity }}
          </span>
          <button
            type="button"
            class="btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center p-0!"
            :aria-label="t('orderChanges.increase')"
            :disabled="!canIncrease(line)"
            @click="changeQuantity(line, 1)"
          >
            <Icon name="material-symbols:add-rounded" class="block h-5 w-5" aria-hidden="true" />
          </button>
        </span>
        <span class="col-span-3">
          <span :class="{ 'line-through text-base-500': line.quantity === 0 }">{{ line.name }}</span>
          <span v-if="line.kind === 'item' && line.deposit > 0" class="ml-1 text-xs text-base-500">
            {{ t('checkout.depositSuffix', { amount: formatCurrency(line.deposit) }) }}
          </span>
          <span v-if="line.voucherCode" class="mt-0.5 flex items-center gap-1">
            <span class="rounded-full bg-success-300 px-2 py-0.5 text-[10px] font-medium text-success-900">
              {{ line.kind === 'voucher_sale' ? t('vouchers.cart.sold') : t('vouchers.cart.badge') }}
            </span>
            <span class="font-mono text-xs text-base-500">{{ formatVoucherCode(line.voucherCode) }}</span>
          </span>
        </span>
        <span class="col-span-1 flex justify-end">
          <CommonStatusBadge v-if="line.order_item_id == null" :label="t('orderChanges.added')" tone="success" />
          <CommonStatusBadge v-else-if="line.quantity === 0" :label="t('orderChanges.removed')" tone="danger" />
        </span>
      </li>
    </ul>

    <div>
      <label class="section-title block">{{ t('orderChanges.addItem') }}</label>
      <div class="flex gap-2">
        <div class="min-w-0 flex-1">
          <CommonSearchSelect
            v-model="itemQuery"
            :options="itemOptions"
            :placeholder="t('orderChanges.addItemPlaceholder')"
            :empty-text="t('orderChanges.noItemsFound')"
            :disabled="!isOnline"
            @select="addItem"
          />
        </div>
        <button
          type="button"
          class="btn-secondary inline-flex shrink-0 items-center gap-1.5"
          :disabled="!isOnline || isFachschaft"
          :title="isFachschaft ? t('vouchers.cart.fachschaftBlocked') : undefined"
          @click="showScan = true"
        >
          <Icon name="material-symbols:qr-code-scanner-rounded" class="h-4 w-4" aria-hidden="true" />
          {{ t('vouchers.scanButton') }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-bold">
        {{ t('common.total') }}:
        <span v-if="newTotal !== originalTotal" class="text-base-500 line-through font-normal">{{ formatCurrency(originalTotal) }}</span>
        {{ formatCurrency(newTotal) }}
      </span>
      <button
        v-if="(order?.is_fachschaft || fachschaftEnabled) && !hasVoucherLines"
        type="button"
        class="px-4 py-2 rounded-md text-sm cursor-pointer transition-colors"
        :class="isFachschaft
          ? 'bg-success-600 text-white'
          : 'bg-base-200 text-black hover:bg-base-300'"
        :disabled="!hasLines"
        @click="isFachschaft = !isFachschaft"
      >
        {{ isFachschaft ? t('checkout.fachschaftMarked') : t('checkout.markFachschaft') }}
      </button>
    </div>

    <p v-if="!hasLines" class="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-900">
      {{ t('orderChanges.cancelOrderHint') }}
    </p>

    <div>
      <label for="order-change-reason" class="section-title block">{{ t('orderChanges.reason') }}</label>
      <textarea
        id="order-change-reason"
        v-model="reason"
        class="input"
        rows="3"
        :maxlength="MAX_REASON_LENGTH"
        :placeholder="t('orderChanges.reasonPlaceholder')"
      />
    </div>

    <template #footer>
      <CommonFormActions
        class="w-full"
        :saving="saving"
        :save-disabled="!isOnline || !hasChanges"
        :cancel-label="t('actions.cancel')"
        :submit-label="t('orderChanges.submit')"
        @cancel="$emit('update:modelValue', false)"
        @submit="submit"
      />
    </template>
  </CommonModal>

  <VoucherScanModal
    v-model="showScan"
    context="orderChange"
    :order-id="order?.id ?? null"
    @sell="onSell"
    @redeem="onRedeem"
  />

  <VoucherRedeemPicker
    v-model="showRedeem"
    :voucher="redeemVoucher"
    :available="redeemAvailable"
    :items="pickerItems"
    :stand-item-ids="null"
    :redeemed="redeemedByItem"
    :paid="{}"
    @confirm="applyRedemption"
  />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useToast } from '~/composables/useToast'
import { useConnectivity } from '~/composables/useConnectivity'
import { cachedFetch } from '~/composables/useCachedFetch'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'
import { lineCashTotal, type LineKind } from '~/utils/lineTotal'
import { formatVoucherCode } from '~/utils/voucherCode'

// Mirrors MAX_CHANGE_TEXT_LENGTH on the server.
const MAX_REASON_LENGTH = 1000

interface EditorLine {
  key: string
  order_item_id: number | null
  item_id: number | null
  name: string
  price: number
  deposit: number
  quantity: number
  originalQuantity: number
  kind: LineKind
  voucherCode: string | null
  coversDeposit: boolean
}

const props = defineProps<{
  modelValue: boolean
  /** An order entry of /api/orders/history. */
  order: any | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted'): void
}>()

const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()
const toast = useToast()
const { isOnline } = useConnectivity()
const { selectedCashier } = useCheckout()
const { fachschaftEnabled } = useFachschaftAvailability()

const lines = ref<EditorLine[]>([])
const isFachschaft = ref(false)
const reason = ref('')
const saving = ref(false)
const items = ref<any[]>([])
const itemQuery = ref('')
/** Lookup results of vouchers scanned in this editor. */
const voucherInfo = ref<Record<string, any>>({})

function reset() {
  const order = props.order
  lines.value = (order?.items ?? []).map((item: any) => ({
    key: `line-${item.id}`,
    order_item_id: item.id,
    item_id: item.item_id,
    name: item.name,
    price: Number(item.price),
    deposit: Number(item.deposit),
    quantity: Number(item.quantity),
    originalQuantity: Number(item.quantity),
    kind: item.line_kind ?? 'item',
    voucherCode: item.voucher_code ?? null,
    coversDeposit: Boolean(item.voucher_covers_deposit),
  }))
  isFachschaft.value = Boolean(order?.is_fachschaft)
  reason.value = ''
  itemQuery.value = ''
  voucherInfo.value = {}
}

async function loadItems() {
  try {
    const { data } = await cachedFetch<any>('/api/items')
    if (data.ok) items.value = data.items.filter((item: any) => item.is_active === 1 || item.is_active === true)
  } catch {
    items.value = []
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  reset()
  loadItems()
}, { immediate: true })

const itemOptions = computed<SearchSelectOption[]>(() => items.value.map(item => ({
  key: item.id,
  label: `${item.name} (${formatCurrency(item.price)})`,
  value: item.id,
})))

function lineTotal(line: EditorLine, quantity: number) {
  return lineCashTotal({ kind: line.kind, quantity, price: line.price, deposit: line.deposit, coversDeposit: line.coversDeposit })
}

const hasLines = computed(() => lines.value.some(line => line.quantity > 0))
const hasVoucherLines = computed(() => lines.value.some(line => line.kind !== 'item' && line.quantity > 0))
const originalTotal = computed(() => props.order?.is_fachschaft
  ? 0
  : lines.value.reduce((sum, line) => sum + lineTotal(line, line.originalQuantity), 0))
const newTotal = computed(() => isFachschaft.value && hasLines.value
  ? 0
  : lines.value.reduce((sum, line) => sum + lineTotal(line, line.quantity), 0))

const hasChanges = computed(() => lines.value.some(line => line.quantity !== line.originalQuantity)
  || (hasLines.value && isFachschaft.value !== Boolean(props.order?.is_fachschaft)))

// Vouchers are never part of a Fachschaft order.
watch(hasVoucherLines, (has) => {
  if (has) isFachschaft.value = false
})

function canIncrease(line: EditorLine) {
  // A sold voucher is one line of one voucher; redemptions grow through the picker.
  if (line.kind === 'voucher_sale') return line.quantity < 1
  if (line.kind === 'voucher_redemption') return line.order_item_id != null && line.quantity < line.originalQuantity
  return true
}

function changeQuantity(line: EditorLine, delta: number) {
  line.quantity = Math.max(0, line.quantity + delta)
  // An added line that drops to zero simply disappears again
  if (line.order_item_id == null && line.quantity === 0) {
    lines.value = lines.value.filter(entry => entry !== line)
  }
}

function addItem(value: unknown) {
  itemQuery.value = ''
  const item = items.value.find(entry => entry.id === Number(value))
  if (!item) return

  const price = Number(item.price)
  const deposit = Number(item.deposit ?? 0)
  const existing = lines.value.find(line => line.kind === 'item' && line.item_id === item.id && line.price === price && line.deposit === deposit)
  if (existing) {
    existing.quantity += 1
    return
  }

  lines.value.push({
    key: `added-${item.id}-${price}-${deposit}`,
    order_item_id: null,
    item_id: item.id,
    name: String(item.name),
    price,
    deposit,
    quantity: 1,
    originalQuantity: 0,
    kind: 'item',
    voucherCode: null,
    coversDeposit: false,
  })
}

const showScan = ref(false)
const showRedeem = ref(false)
const redeemCode = ref<string | null>(null)
const redeemVoucher = computed(() => redeemCode.value ? voucherInfo.value[redeemCode.value] ?? null : null)

const pickerItems = computed(() => items.value.map(item => ({
  id: Number(item.id),
  name: String(item.name),
  price: Number(item.price),
  deposit: Number(item.deposit ?? 0),
})))

const redeemedByItem = computed(() => {
  const result: Record<number, number> = {}
  for (const line of lines.value) {
    if (line.kind === 'voucher_redemption' && line.order_item_id == null && line.voucherCode === redeemCode.value) {
      result[line.item_id!] = line.quantity
    }
  }
  return result
})

/**
 * Units the voucher can give to new lines of this change: what it has left
 * (or all of them if it is sold in this change) plus what this change gives
 * back by reducing the order's existing redemptions of it.
 */
const redeemAvailable = computed(() => {
  const code = redeemCode.value
  const voucher = code ? voucherInfo.value[code] : null
  if (!code || !voucher) return 0
  const soldHere = lines.value.some(line => line.kind === 'voucher_sale' && line.order_item_id == null && line.voucherCode === code)
  const returned = lines.value
    .filter(line => line.kind === 'voucher_redemption' && line.order_item_id != null && line.voucherCode === code)
    .reduce((sum, line) => sum + line.originalQuantity - line.quantity, 0)
  return (soldHere ? Number(voucher.units_total) : Number(voucher.units_remaining)) + returned
})

function onSell(result: any) {
  const voucher = result.voucher
  showScan.value = false
  voucherInfo.value = { ...voucherInfo.value, [voucher.code]: voucher }
  if (lines.value.some(line => line.kind === 'voucher_sale' && line.voucherCode === voucher.code)) {
    toast.info(t('vouchers.cart.alreadyInCart'))
    return
  }
  lines.value.push({
    key: `added-sale-${voucher.code}`,
    order_item_id: null,
    item_id: null,
    name: `${t('vouchers.cart.sold')} ${voucher.batch.name}`,
    price: Number(voucher.batch.sale_price),
    deposit: 0,
    quantity: 1,
    originalQuantity: 0,
    kind: 'voucher_sale',
    voucherCode: voucher.code,
    coversDeposit: false,
  })
}

function onRedeem(result: any) {
  const voucher = result.voucher
  showScan.value = false
  voucherInfo.value = { ...voucherInfo.value, [voucher.code]: voucher }
  redeemCode.value = voucher.code
  showRedeem.value = true
}

function applyRedemption(picked: Record<number, number>) {
  const code = redeemCode.value
  const voucher = code ? voucherInfo.value[code] : null
  if (!code || !voucher) return

  const itemsById = new Map(items.value.map(item => [Number(item.id), item]))
  const kept = lines.value.filter(line => !(line.kind === 'voucher_redemption' && line.order_item_id == null && line.voucherCode === code))
  for (const [rawId, count] of Object.entries(picked)) {
    const item = itemsById.get(Number(rawId))
    if (!item || count <= 0) continue
    kept.push({
      key: `added-redeem-${code}-${item.id}`,
      order_item_id: null,
      item_id: Number(item.id),
      name: String(item.name),
      price: Number(item.price),
      deposit: Number(item.deposit ?? 0),
      quantity: count,
      originalQuantity: 0,
      kind: 'voucher_redemption',
      voucherCode: code,
      coversDeposit: Boolean(voucher.batch.includes_deposit),
    })
  }
  lines.value = kept
}

async function submit() {
  if (!props.order || !hasChanges.value) return

  const addedLines = lines.value.filter(line => line.order_item_id == null && line.quantity > 0)

  saving.value = true
  try {
    const res = await $fetch<any>('/api/order-changes/create', {
      method: 'POST',
      body: {
        order_id: props.order.id,
        cashier_id: selectedCashier.value ? Number(selectedCashier.value) : null,
        reason: reason.value.trim() || null,
        is_fachschaft: isFachschaft.value && hasLines.value,
        lines: lines.value
          .filter(line => line.order_item_id != null && line.quantity > 0)
          .map(line => ({ order_item_id: line.order_item_id, quantity: line.quantity })),
        added: addedLines
          .filter(line => line.kind !== 'voucher_sale')
          .map(line => ({
            id: line.item_id,
            quantity: line.quantity,
            unit_price: line.price,
            unit_deposit: line.deposit,
            ...(line.kind === 'voucher_redemption' ? { voucher_code: line.voucherCode } : {}),
          })),
        added_voucher_sales: addedLines
          .filter(line => line.kind === 'voucher_sale')
          .map(line => ({ code: line.voucherCode, unit_price: line.price })),
      },
    })

    if (!res.ok) {
      toast.error(res.error || t('common.unknownError'))
      return
    }

    toast.success(t('orderChanges.submitted'))
    emit('update:modelValue', false)
    emit('submitted')
  } catch {
    toast.error(t('common.unknownError'))
  } finally {
    saving.value = false
  }
}
</script>
