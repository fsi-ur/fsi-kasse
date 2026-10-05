<template>
  <Page :headline1="t('checkout.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
        <MenuSelectStand />
      </div>
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="itemsUnavailable" variant="noData" />

      <div class="col-span-12 lg:col-span-6 xl:col-span-8 bg-white p-4 rounded-xl shadow-lg">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <h2 class="text-lg font-semibold">
            {{ t('checkout.items') }}<template v-if="effectiveStand"> · {{ effectiveStand.name }}</template>
          </h2>
          <button
            v-if="effectiveStand"
            class="ml-auto px-4 py-2 rounded-md text-sm cursor-pointer transition-colors"
            :class="showAllItems
              ? 'bg-accent-500 text-white hover:bg-accent-600'
              : 'bg-base-200 text-black hover:bg-base-300'"
            @click="showAllItems = !showAllItems"
          >
            {{ showAllItems ? t('checkout.showStandItems', { stand: effectiveStand.name }) : t('checkout.showAllItems') }}
          </button>
        </div>
        <div v-if="effectiveStand && visibleItems.length === 0 && items.length > 0" class="text-base-400">
          {{ t('checkout.standHasNoItems') }}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="bg-base-100 border border-base-200 p-4 rounded-lg cursor-pointer transition-colors hover:bg-base-200"
            @click="addToOrder(item)"
          >
            <div class="text-lg font-bold">{{ item.name }}</div>
            <div class="text-sm text-base-600">{{ formatCurrency(item.price) }}</div>
          </div>
        </div>
      </div>

      <div class="col-span-12 lg:col-span-6 xl:col-span-4 bg-white p-4 rounded-xl shadow-lg">
        <div class="flex items-center gap-2 mb-4">
          <h2 class="text-lg font-semibold">{{ t('checkout.currentOrder') }}</h2>
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1.5 rounded-md bg-base-200 px-3 py-2 text-sm transition-colors not-disabled:cursor-pointer not-disabled:hover:bg-base-300 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!isOnline || !selectedEvent"
            :title="!isOnline ? t('vouchers.offlineBlocked') : !selectedEvent ? t('select.event') : undefined"
            @click="showScan = true"
          >
            <Icon name="material-symbols:qr-code-scanner-rounded" class="h-4 w-4" aria-hidden="true" />
            {{ t('vouchers.scanButton') }}
          </button>
        </div>
        <p v-if="hasVoucherLines && !isOnline" class="mb-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">
          {{ t('vouchers.offlineBlocked') }}
        </p>
        <div v-if="orderItems.length === 0" class="text-base-400">
          {{ t('checkout.noItems') }}
        </div>

        <ul>
          <li
            v-for="line in orderItems"
            :key="line.key"
            class="grid grid-cols-6 items-center py-2 border-b border-base-200"
          >
            <span class="text-left col-span-1">{{ line.quantity }}</span>
            <span class="text-left col-span-2 min-w-0">
              <template v-if="line.kind === 'voucher_sale'">
                {{ t('vouchers.cart.sold') }}
                <span class="block truncate text-xs text-base-500">{{ line.batchName }} · {{ formatVoucherCode(line.voucherCode!) }}</span>
                <button
                  type="button"
                  class="text-xs text-link-600 hover:underline cursor-pointer disabled:opacity-50"
                  :disabled="!isOnline"
                  @click="openRedeemFor(line.voucherCode!)"
                >
                  {{ t('vouchers.cart.redeemNow') }}
                </button>
              </template>
              <template v-else>
                {{ line.name }}
                <span v-if="line.kind === 'item' && line.deposit > 0" class="text-xs text-base-500">
                  {{ t('checkout.depositSuffix', { amount: formatCurrency(line.deposit) }) }}
                </span>
                <button
                  v-if="line.kind === 'voucher_redemption'"
                  type="button"
                  class="mt-0.5 flex items-center gap-1 text-left cursor-pointer"
                  @click="openRedeemFor(line.voucherCode!)"
                >
                  <span class="rounded-full bg-success-300 px-2 py-0.5 text-[10px] font-medium text-success-900">{{ t('vouchers.cart.badge') }}</span>
                  <span class="truncate font-mono text-xs text-base-500">{{ formatVoucherCode(line.voucherCode!) }}</span>
                </button>
                <span v-if="line.kind === 'voucher_redemption' && !line.coversDeposit && line.deposit > 0" class="block text-xs text-base-500">
                  {{ t('vouchers.cart.depositOnly', { amount: formatCurrency(line.deposit) }) }}
                </span>
              </template>
            </span>
            <span class="text-right font-semibold col-span-2">
              <span v-if="line.kind === 'voucher_redemption'" class="block text-xs font-normal text-base-400 line-through">
                {{ formatCurrency(lineWorth(line)) }}
              </span>
              {{ formatCurrency(lineCashTotal(line)) }}
            </span>
            <button
              class="col-span-1 flex justify-end cursor-pointer"
              :aria-label="t('actions.remove')"
              @click="removeLine(line)"
            >
              <Icon
                name="material-symbols:close-rounded"
                class="w-4 h-4 hover:opacity-70 transition"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>

        <div class="flex flex-rows flex-wrap justify-between">
          <div class="mt-4 font-bold text-lg">
            {{ t('common.total') }}: {{ formatCurrency(total) }}
          </div>
          <button
            v-if="fachschaftEnabled && !hasVoucherLines"
            @click="isFachschaft = !isFachschaft"
            class="mt-4 px-4 py-2 rounded-md text-sm cursor-pointer transition-colors"
            :class="isFachschaft
              ? 'bg-success-600 text-white'
              : 'bg-base-200 text-black hover:bg-base-300'"
          >
            {{ isFachschaft ? t('checkout.fachschaftMarked') : t('checkout.markFachschaft') }}
          </button>
        </div>

        <!-- Donation section -->
        <div class="mt-4 border-t border-base-200 pt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm font-semibold text-base-700">{{ t('checkout.donation') }}</span>
            <div class="ml-auto flex rounded-md border border-base-200 overflow-hidden text-xs">
              <button
                class="px-3 py-1 cursor-pointer transition-colors"
                :class="donationMode === null
                  ? 'bg-base-200 text-base-700'
                  : 'bg-white text-base-400 hover:bg-base-50'"
                @click="setDonationMode(null)"
              >
                {{ t('checkout.donationNone') }}
              </button>
              <button
                class="px-3 py-1 cursor-pointer transition-colors border-l border-base-200"
                :class="donationMode === 'direct'
                  ? 'bg-accent-500 text-white'
                  : 'bg-white text-base-400 hover:bg-base-50'"
                @click="setDonationMode('direct')"
              >
                {{ t('checkout.donationDirect') }}
              </button>
              <button
                v-if="orderItems.length > 0 && !isFachschaft"
                class="px-3 py-1 cursor-pointer transition-colors border-l border-base-200"
                :class="donationMode === 'paid'
                  ? 'bg-accent-500 text-white'
                  : 'bg-white text-base-400 hover:bg-base-50'"
                @click="setDonationMode('paid')"
              >
                {{ t('checkout.donationFromPaid') }}
              </button>
            </div>
          </div>

          <div v-if="donationMode === 'direct'" class="flex items-center gap-2">
            <input
              type="text"
              inputmode="decimal"
              class="flex-1 border border-base-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              :placeholder="t('checkout.donationAmountPlaceholder')"
              :value="directDisplayValue"
              @focus="onDirectFocus"
              @input="onDirectInput"
              @blur="onDirectBlur"
            />
            <span class="text-sm text-base-600">€</span>
          </div>

          <div v-else-if="donationMode === 'paid'" class="space-y-2">
            <div class="flex items-center gap-2">
              <input
                type="text"
                inputmode="decimal"
                class="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
                :class="paidAmountWarning
                  ? 'border-danger-400 focus:ring-danger-400'
                  : 'border-base-300 focus:ring-accent-400'"
                :placeholder="total.toFixed(2)"
                :value="paidDisplayValue"
                @focus="onPaidFocus"
                @input="onPaidInput"
                @blur="onPaidBlur"
              />
              <span class="text-sm text-base-600">€</span>
            </div>
            <p v-if="paidAmountWarning" class="text-xs text-danger-500">
              {{ t('checkout.paidAmountTooLow', { total: formatCurrency(total) }) }}
            </p>
            <div v-else-if="donationFromPaid > 0" class="flex justify-between text-sm font-semibold text-accent-600">
              <span>{{ t('checkout.donationLabel') }}</span>
              <span>{{ formatCurrency(donationFromPaid) }}</span>
            </div>
          </div>
        </div>

        <button
          class="btn-primary mt-4 w-full p-3"
          :disabled="!canSubmit || !selectedCashier || !selectedEvent || (hasVoucherLines && !isOnline) || submitting"
          @click="showConfirm = true"
        >
          {{ t('checkout.saveOrder') }}
        </button>
      </div>
    </template>
  </Page>
  <FormConfirmation
    v-if="showConfirm"
    :headline="t('checkout.confirmTitle')"
    @confirm="finishOrder"
    @cancel="showConfirm = false"
  >
    <template #message>
      {{ t('checkout.confirmQuestion') }}<br />
      <span v-if="orderItems.length > 0" class="font-bold">{{ t('common.total') }}: {{ formatCurrency(total) }}</span>
      <span v-if="effectiveDonation > 0" class="block text-accent-600 font-bold">
        {{ t('checkout.donationLabel') }}: {{ formatCurrency(effectiveDonation) }}
      </span>
    </template>
  </FormConfirmation>

  <VoucherScanModal
    v-model="showScan"
    context="checkout"
    :event-id="selectedEvent ? Number(selectedEvent) : null"
    :blocked-hint="isFachschaft ? t('vouchers.cart.fachschaftBlocked') : null"
    @sell="onSell"
    @redeem="onRedeem"
  />

  <VoucherRedeemPicker
    v-model="showRedeem"
    :voucher="redeemVoucher"
    :available="redeemAvailable"
    :items="pickerItems"
    :stand-item-ids="effectiveStand && !showAllItems ? effectiveStand.item_ids : null"
    :redeemed="redeemedByItem"
    :paid="paidByItem"
    @confirm="applyRedemption"
  />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useConnectivity } from '~/composables/useConnectivity'
import { sanitizeCurrencyInput, parseCurrencyInput, focusAndSelectInput } from '~/composables/useCurrencyInput'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged, useOfflineQueue, type CheckoutPayload } from '~/composables/useOfflineQueue'
import { cartLineKey, type CartLine } from '~/composables/useCheckout'
import { createClientUuid } from '~/utils/network'
import { lineCashTotal, lineWorth } from '~/utils/lineTotal'
import { formatVoucherCode } from '~/utils/voucherCode'

const items = ref<any[]>([])
const itemsUnavailable = ref(false)
const showConfirm = ref(false)
const submitting = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const {
  selectedCashier, selectedEvent, selectedCashierName, selectedEventName, orderItems, isFachschaft,
  donationMode, directDonation: directAmount, paidAmount, showAllItems,
} = useCheckout()
const { effectiveStand } = useStands()
const { fachschaftEnabled } = useFachschaftAvailability()
const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()
const toast = useToast()
const { onRefresh } = useAppRefresh()
const { submit } = useOfflineQueue()
const { isOnline } = useConnectivity()


// direct donation input state
const directRaw = ref('')
const directFocused = ref(false)
const directDisplayValue = computed(() =>
  directFocused.value ? directRaw.value : (directAmount.value > 0 ? directAmount.value.toFixed(2) : '')
)

function onDirectFocus(e: FocusEvent) {
  directFocused.value = true
  directRaw.value = directAmount.value > 0 ? String(directAmount.value) : ''
  focusAndSelectInput(e)
}
function onDirectInput(e: Event) {
  const raw = sanitizeCurrencyInput((e.target as HTMLInputElement).value)
  directRaw.value = raw
  directAmount.value = parseCurrencyInput(raw)
  ;(e.target as HTMLInputElement).value = raw
}
function onDirectBlur() {
  directFocused.value = false
  directAmount.value = Number(directAmount.value.toFixed(2))
  directRaw.value = ''
}

// paid-amount input state
const paidRaw = ref('')
const paidFocused = ref(false)
const paidDisplayValue = computed(() =>
  paidFocused.value ? paidRaw.value : (paidAmount.value > 0 ? paidAmount.value.toFixed(2) : '')
)

function onPaidFocus(e: FocusEvent) {
  paidFocused.value = true
  paidRaw.value = paidAmount.value > 0 ? String(paidAmount.value) : ''
  focusAndSelectInput(e)
}
function onPaidInput(e: Event) {
  const raw = sanitizeCurrencyInput((e.target as HTMLInputElement).value)
  paidRaw.value = raw
  paidAmount.value = parseCurrencyInput(raw)
  ;(e.target as HTMLInputElement).value = raw
}
function onPaidBlur() {
  paidFocused.value = false
  paidAmount.value = Number(paidAmount.value.toFixed(2))
  paidRaw.value = ''
}

const paidAmountWarning = computed(() =>
  donationMode.value === 'paid' && paidAmount.value > 0 && paidAmount.value < total.value
)

const donationFromPaid = computed(() => {
  if (paidAmount.value <= total.value) return 0
  return Math.round((paidAmount.value - total.value) * 100) / 100
})

const effectiveDonation = computed(() => {
  if (donationMode.value === 'direct') return directAmount.value > 0 ? directAmount.value : 0
  if (donationMode.value === 'paid') return donationFromPaid.value
  return 0
})

const canSubmit = computed(() => {
  if (orderItems.value.length > 0) return true
  return effectiveDonation.value > 0
})

function setDonationMode(mode: 'direct' | 'paid' | null) {
  donationMode.value = mode
  directAmount.value = 0
  directRaw.value = ''
  directFocused.value = false
  paidAmount.value = 0
  paidRaw.value = ''
  paidFocused.value = false
}

const hasVoucherLines = computed(() => orderItems.value.some(line => line.kind !== 'item'))

watch(fachschaftEnabled, (enabled) => {
  if (!enabled) isFachschaft.value = false
}, { immediate: true })

// Vouchers are never part of a Fachschaft order (the server rejects that too).
watch(hasVoucherLines, (has) => {
  if (has) isFachschaft.value = false
}, { immediate: true })

watch([() => orderItems.value.length, isFachschaft], ([count, fachschaft]) => {
  if (donationMode.value === 'paid' && (count === 0 || fachschaft)) setDonationMode(null)
}, { immediate: true })

// "Alle Artikel anzeigen" only widens the grid; the order still counts for the
// selected stand. The cart is never filtered — it is reconciled against all items.
const visibleItems = computed(() => {
  const stand = effectiveStand.value
  if (!stand || showAllItems.value) return items.value
  const standItemIds = new Set(stand.item_ids)
  return items.value.filter(item => standItemIds.has(Number(item.id)))
})

async function loadItems() {
  let result
  try {
    result = await cachedFetch<any>('/api/items')
  } catch {
    itemsUnavailable.value = items.value.length === 0
    return
  }

  itemsUnavailable.value = false
  const res = result.data
  if (res.ok) {
    const allItems = 'items' in res ? res.items as any[] : []
    items.value = allItems.filter(i => i.is_active === 1 || i.is_active === true)

    if (!result.stale) {
      reconcileCart()
      if (hasVoucherLines.value) revalidateVoucherLines().catch(() => {})
    }
  }
}

// The cart survives page switches and reloads, so an admin price change or deactivation can
// leave it stale. Bring it back in line with what the server would actually book.
function reconcileCart() {
  const available = new Map(items.value.map(item => [item.id, item]))
  const removed: string[] = []
  let priceChanged = false

  orderItems.value = orderItems.value.filter((line) => {
    if (line.kind === 'voucher_sale') return true
    const item = available.get(line.id)
    if (!item) {
      removed.push(String(line.name))
      return false
    }

    const price = Number(item.price)
    const deposit = Number(item.deposit ?? 0)

    if (Number(line.price) !== price || Number(line.deposit ?? 0) !== deposit) {
      line.price = price
      line.deposit = deposit
      line.name = item.name
      priceChanged = true
    }

    return true
  })

  for (const name of removed) toast.error(t('checkout.itemUnavailable', { name }))
  if (priceChanged) toast.info(t('checkout.priceUpdated'))
}

onMounted(loadItems)
onRefresh(loadItems)
onOfflineDataChanged(loadItems)

function addToOrder(item: any) {
  const existing = orderItems.value.find(line => line.kind === 'item' && line.id === item.id)
  if (existing) existing.quantity += 1
  else orderItems.value.push({
    ...item,
    key: cartLineKey('item', item.id),
    kind: 'item',
    id: item.id,
    name: item.name,
    price: Number(item.price),
    quantity: 1,
    deposit: Number(item.deposit ?? 0),
  })
}

const total = computed(() => {
  if (isFachschaft.value) return 0
  return Math.round(orderItems.value.reduce((sum, line) => sum + lineCashTotal(line), 0) * 100) / 100
})

function removeLine(line: CartLine) {
  // Redemptions of a voucher that is only sold in this very cart go with the sale.
  const dropRedemptions = line.kind === 'voucher_sale'
    && voucherInfo.value[line.voucherCode!]?.status !== 'active'
  orderItems.value = orderItems.value.filter(entry => entry.key !== line.key
    && !(dropRedemptions && entry.kind === 'voucher_redemption' && entry.voucherCode === line.voucherCode))
}

const showScan = ref(false)
const showRedeem = ref(false)
const redeemCode = ref<string | null>(null)
/** Lookup results of the vouchers in the cart (not persisted — always re-checked against the server). */
const voucherInfo = ref<Record<string, any>>({})

const redeemVoucher = computed(() => redeemCode.value ? voucherInfo.value[redeemCode.value] ?? null : null)

function isSoldInCart(code: string) {
  return orderItems.value.some(line => line.kind === 'voucher_sale' && line.voucherCode === code)
}

/** Units the voucher can give in this cart: all of them if it is sold here, else what is left. */
function availableUnits(code: string) {
  const voucher = voucherInfo.value[code]
  if (!voucher) return 0
  return isSoldInCart(code) ? Number(voucher.units_total) : Number(voucher.units_remaining)
}

const redeemAvailable = computed(() => redeemCode.value ? availableUnits(redeemCode.value) : 0)

const pickerItems = computed(() => items.value.map(item => ({
  id: Number(item.id),
  name: String(item.name),
  price: Number(item.price),
  deposit: Number(item.deposit ?? 0),
})))

const redeemedByItem = computed(() => {
  const result: Record<number, number> = {}
  for (const line of orderItems.value) {
    if (line.kind === 'voucher_redemption' && line.voucherCode === redeemCode.value) result[line.id!] = line.quantity
  }
  return result
})

const paidByItem = computed(() => {
  const result: Record<number, number> = {}
  for (const line of orderItems.value) {
    if (line.kind === 'item') result[line.id!] = (result[line.id!] ?? 0) + line.quantity
  }
  return result
})

function onSell(result: any) {
  const voucher = result.voucher
  showScan.value = false
  voucherInfo.value = { ...voucherInfo.value, [voucher.code]: voucher }
  if (isSoldInCart(voucher.code)) {
    toast.info(t('vouchers.cart.alreadyInCart'))
    return
  }
  orderItems.value.push({
    key: cartLineKey('voucher_sale', null, voucher.code),
    kind: 'voucher_sale',
    id: null,
    name: `${t('vouchers.cart.sold')} ${voucher.batch.name}`,
    batchName: voucher.batch.name,
    price: Number(voucher.batch.sale_price),
    deposit: 0,
    quantity: 1,
    voucherCode: voucher.code,
  })
  toast.success(t('vouchers.cart.saleAdded', { price: formatCurrency(Number(voucher.batch.sale_price)) }))
}

function onRedeem(result: any) {
  const voucher = result.voucher
  showScan.value = false
  voucherInfo.value = { ...voucherInfo.value, [voucher.code]: voucher }
  redeemCode.value = voucher.code
  showRedeem.value = true
}

async function openRedeemFor(code: string) {
  if (!voucherInfo.value[code]) {
    try {
      await revalidateVoucherLines()
    } catch {
      toast.error(t('vouchers.offlineBlocked'))
      return
    }
    if (!voucherInfo.value[code]) return
  }
  redeemCode.value = code
  showRedeem.value = true
}

/**
 * Replaces the voucher's redemption lines with the picked units. Units that
 * are newly redeemed come out of matching paid lines first (the customer pays
 * with the voucher instead).
 */
function applyRedemption(picked: Record<number, number>) {
  const code = redeemCode.value
  const voucher = code ? voucherInfo.value[code] : null
  if (!code || !voucher) return

  const itemsById = new Map(items.value.map(item => [Number(item.id), item]))
  const before = redeemedByItem.value
  let lines = [...orderItems.value]

  for (const [rawId, count] of Object.entries(picked)) {
    const id = Number(rawId)
    let toConvert = Math.max(0, count - (before[id] ?? 0))
    lines = lines.flatMap((line) => {
      if (toConvert <= 0 || line.kind !== 'item' || line.id !== id) return [line]
      const taken = Math.min(toConvert, line.quantity)
      toConvert -= taken
      return line.quantity - taken > 0 ? [{ ...line, quantity: line.quantity - taken }] : []
    })
  }

  lines = lines.filter(line => !(line.kind === 'voucher_redemption' && line.voucherCode === code))
  for (const [rawId, count] of Object.entries(picked)) {
    const item = itemsById.get(Number(rawId))
    if (!item || count <= 0) continue
    lines.push({
      key: cartLineKey('voucher_redemption', Number(item.id), code),
      kind: 'voucher_redemption',
      id: Number(item.id),
      name: String(item.name),
      price: Number(item.price),
      deposit: Number(item.deposit ?? 0),
      quantity: count,
      voucherCode: code,
      coversDeposit: Boolean(voucher.batch.includes_deposit),
    })
  }

  orderItems.value = lines
}

/**
 * Re-checks every voucher in the cart against the server (never against stale
 * data) and drops or shrinks lines that are no longer valid. Returns whether
 * the cart changed. Throws when the server is unreachable.
 */
async function revalidateVoucherLines(): Promise<boolean> {
  const codes = [...new Set(orderItems.value.filter(line => line.voucherCode).map(line => line.voucherCode!))]
  if (!codes.length) return false

  const results = new Map<string, any>()
  for (const code of codes) {
    const res = await $fetch<any>('/api/vouchers/lookup', { method: 'POST', body: { code, event_id: Number(selectedEvent.value) || null } })
    results.set(code, res)
  }

  const info = { ...voucherInfo.value }
  const messages: string[] = []
  let lines = [...orderItems.value]

  for (const code of codes) {
    const res = results.get(code)
    const formatted = formatVoucherCode(code)
    if (!res?.ok) {
      messages.push(t('vouchers.cart.removed', { code: formatted, reason: res?.error ?? t('common.unknownError') }))
      lines = lines.filter(line => line.voucherCode !== code)
      continue
    }
    info[code] = res.voucher

    const soldHere = lines.some(line => line.kind === 'voucher_sale' && line.voucherCode === code)
    if (soldHere && res.action !== 'sell') {
      messages.push(t('vouchers.cart.removed', { code: formatted, reason: res.reason ?? t('vouchers.scan.notUsable') }))
      lines = lines.filter(line => line.voucherCode !== code)
      continue
    }
    if (soldHere) {
      const salePrice = Number(res.voucher.batch.sale_price)
      lines = lines.map(line => line.kind === 'voucher_sale' && line.voucherCode === code && line.price !== salePrice
        ? { ...line, price: salePrice }
        : line)
    }

    const redemptions = lines.filter(line => line.kind === 'voucher_redemption' && line.voucherCode === code)
    if (!redemptions.length) continue
    if (!soldHere && res.action !== 'redeem') {
      messages.push(t('vouchers.cart.removed', { code: formatted, reason: res.reason ?? t('vouchers.scan.notUsable') }))
      lines = lines.filter(line => !(line.kind === 'voucher_redemption' && line.voucherCode === code))
      continue
    }

    const allowed = new Set<number>(res.voucher.allowed_item_ids)
    let left = soldHere ? Number(res.voucher.units_total) : Number(res.voucher.units_remaining)
    let shrunk = false
    lines = lines.flatMap((line) => {
      if (line.kind !== 'voucher_redemption' || line.voucherCode !== code) return [line]
      if (!allowed.has(Number(line.id))) {
        shrunk = true
        return []
      }
      const quantity = Math.min(line.quantity, left)
      left -= quantity
      if (quantity !== line.quantity) shrunk = true
      const coversDeposit = Boolean(res.voucher.batch.includes_deposit)
      return quantity > 0 ? [{ ...line, quantity, coversDeposit }] : []
    })
    if (shrunk) messages.push(t('vouchers.cart.reduced', { code: formatted }))
  }

  voucherInfo.value = info
  const changed = JSON.stringify(lines) !== JSON.stringify(orderItems.value)
  if (changed) orderItems.value = lines
  for (const message of messages) toast.error(message)
  return changed
}

function describeLine(line: CartLine) {
  if (line.kind === 'voucher_sale') return `${line.name} (${formatVoucherCode(line.voucherCode!)})`
  if (line.kind === 'voucher_redemption') return `${line.quantity}× ${line.name} (${t('vouchers.cart.badge')} ${formatVoucherCode(line.voucherCode!)})`
  return `${line.quantity}× ${line.name}`
}

async function finishOrder() {
  showConfirm.value = false
  if (submitting.value) return
  submitting.value = true
  try {
    await bookOrder()
  } finally {
    submitting.value = false
  }
}

async function bookOrder() {
  const withVouchers = hasVoucherLines.value
  if (withVouchers) {
    // Vouchers need a live check right before booking; a changed cart goes back to the cashier.
    try {
      if (await revalidateVoucherLines()) {
        toast.info(t('vouchers.cart.changedBeforeSubmit'))
        return
      }
    } catch {
      toast.error(t('vouchers.offlineBlocked'))
      return
    }
  }

  const donation: CheckoutPayload['donation'] = donationMode.value === 'direct' && directAmount.value > 0
    ? { mode: 'direct', amount: directAmount.value }
    : donationMode.value === 'paid' && paidAmount.value > 0
      ? { mode: 'paid', paid_amount: paidAmount.value }
      : null

  const payload: CheckoutPayload = {
    client_uuid: createClientUuid(),
    cashier_id: Number(selectedCashier.value),
    event_id: Number(selectedEvent.value),
    is_fachschaft: isFachschaft.value,
    stand_id: effectiveStand.value?.id ?? null,
    items: orderItems.value
      .filter(line => line.kind !== 'voucher_sale')
      .map(line => ({
        id: Number(line.id),
        quantity: line.quantity,
        unit_price: Number(line.price),
        unit_deposit: Number(line.deposit ?? 0),
        ...(line.kind === 'voucher_redemption' ? { voucher_code: line.voucherCode } : {}),
      })),
    voucher_sales: orderItems.value
      .filter(line => line.kind === 'voucher_sale')
      .map(line => ({ code: line.voucherCode!, unit_price: Number(line.price) })),
    donation,
  }

  const summaryParts = orderItems.value.map(describeLine)
  if (effectiveDonation.value > 0) {
    summaryParts.push(`${t('checkout.donationLabel')} ${formatCurrency(effectiveDonation.value)}`)
  }

  const localTotal = total.value
  const hasOrderLines = orderItems.value.length > 0

  let outcome
  try {
    outcome = await submit('checkout', payload, {
      cashierName: selectedCashierName.value,
      eventName: selectedEventName.value,
      standName: effectiveStand.value?.name,
      summary: summaryParts.join(', '),
      localTotal,
    }, { requireOnline: withVouchers })
  } catch {
    toast.error(t('common.unknownError'))
    return
  }

  if (outcome.status === 'offline_blocked') {
    toast.error(t('vouchers.offlineBlocked'))
    return
  }

  if (outcome.status === 'rejected') {
    toast.error(outcome.error ?? t('checkout.saveFailed'))
    return
  }

  orderItems.value = []
  voucherInfo.value = {}
  isFachschaft.value = false
  setDonationMode(null)

  if (outcome.status === 'queued') {
    toast.info(t('offline.savedOffline'))
    return
  }

  const bookedTotal = hasOrderLines ? Number(outcome.result.total) : null
  const totalMismatch = bookedTotal !== null && Math.abs(bookedTotal - localTotal) >= 0.005

  toast.success(totalMismatch
    ? t('checkout.savedWithTotal', { total: formatCurrency(bookedTotal!) })
    : t('checkout.saved'))
}
</script>
