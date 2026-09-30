<template>
  <Page :headline1="t('checkout.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
      </div>
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="itemsUnavailable" variant="noData" />

      <div class="col-span-12 lg:col-span-6 xl:col-span-8 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.items') }}</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="item in items"
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
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.currentOrder') }}</h2>
        <div v-if="orderItems.length === 0" class="text-base-400">
          {{ t('checkout.noItems') }}
        </div>

        <ul>
          <li
            v-for="line in orderItems"
            :key="line.id"
            class="grid grid-cols-6 items-center py-2 border-b border-base-200"
          >
            <span class="text-left col-span-1">{{ line.quantity }}</span>
            <span class="text-left col-span-2">{{ line.name }}
              <span v-if="line.deposit > 0" class="text-xs text-base-500">
                {{ t('checkout.depositSuffix', { amount: formatCurrency(line.deposit) }) }}
              </span>
            </span>
            <span class="text-right font-semibold col-span-2">
              {{ formatCurrency((line.price * line.quantity) + (line.deposit * line.quantity)) }}
            </span>
            <button
              class="col-span-1 flex justify-end cursor-pointer"
              @click="removeLine(line.id)"
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
          :disabled="!canSubmit || !selectedCashier || !selectedEvent"
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
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { sanitizeCurrencyInput, parseCurrencyInput, focusAndSelectInput } from '~/composables/useCurrencyInput'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged, useOfflineQueue, type CheckoutPayload } from '~/composables/useOfflineQueue'
import { createClientUuid } from '~/utils/network'

const items = ref<any[]>([])
const itemsUnavailable = ref(false)
const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const {
  selectedCashier, selectedEvent, selectedCashierName, selectedEventName, orderItems, isFachschaft,
  donationMode, directDonation: directAmount, paidAmount,
} = useCheckout()
const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()
const toast = useToast()
const { onRefresh } = useAppRefresh()
const { submit } = useOfflineQueue()


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

watch([() => orderItems.value.length, isFachschaft], ([count, fachschaft]) => {
  if (donationMode.value === 'paid' && (count === 0 || fachschaft)) setDonationMode(null)
}, { immediate: true })

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

    if (!result.stale) reconcileCart()
  }
}

// The cart survives page switches and reloads, so an admin price change or deactivation can
// leave it stale. Bring it back in line with what the server would actually book.
function reconcileCart() {
  const available = new Map(items.value.map(item => [item.id, item]))
  const removed: string[] = []
  let priceChanged = false

  orderItems.value = orderItems.value.filter((line) => {
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
  const existing = orderItems.value.find((it) => it.id === item.id)
  if (existing) existing.quantity += 1
  else orderItems.value.push({
    ...item,
    quantity: 1,
    deposit: item.deposit ?? 0
  })
}

const total = computed(() => {
  if (isFachschaft.value) return 0
  return orderItems.value.reduce(
    (sum, it) => sum + (it.price * it.quantity) + (it.deposit * it.quantity),
    0
  )
})

function removeLine(id: number) {
  orderItems.value = orderItems.value.filter(line => line.id !== id)
}

async function finishOrder() {
  showConfirm.value = false

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
    items: orderItems.value.map(line => ({
      id: line.id,
      quantity: line.quantity,
      unit_price: Number(line.price),
      unit_deposit: Number(line.deposit ?? 0),
    })),
    donation,
  }

  const summaryParts = orderItems.value.map(line => `${line.quantity}× ${line.name}`)
  if (effectiveDonation.value > 0) {
    summaryParts.push(`${t('checkout.donationLabel')} ${formatCurrency(effectiveDonation.value)}`)
  }

  const localTotal = total.value

  let outcome
  try {
    outcome = await submit('checkout', payload, {
      cashierName: selectedCashierName.value,
      eventName: selectedEventName.value,
      summary: summaryParts.join(', '),
      localTotal,
    })
  } catch {
    toast.error(t('common.unknownError'))
    return
  }

  if (outcome.status === 'rejected') {
    toast.error(outcome.error ?? t('checkout.saveFailed'))
    return
  }

  orderItems.value = []
  isFachschaft.value = false
  setDonationMode(null)

  if (outcome.status === 'queued') {
    toast.info(t('offline.savedOffline'))
    return
  }

  const bookedTotal = payload.items.length > 0 ? Number(outcome.result.total) : null
  const totalMismatch = bookedTotal !== null && Math.abs(bookedTotal - localTotal) >= 0.005

  toast.success(totalMismatch
    ? t('checkout.savedWithTotal', { total: formatCurrency(bookedTotal!) })
    : t('checkout.saved'))
}
</script>
