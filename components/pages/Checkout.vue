<template>
  <Page :headline1="t('checkout.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
      </div>
    </template>

    <template #cards>
      <div class="col-span-12 lg:col-span-6 xl:col-span-8 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.items') }}</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="item in items"
            :key="item.id"
            class="bg-gray-100 border border-slate-200 p-4 rounded-lg cursor-pointer transition-colors hover:bg-gray-200"
            @click="addToOrder(item)"
          >
            <div class="text-lg font-bold">{{ item.name }}</div>
            <div class="text-sm text-slate-600">{{ item.price }} €</div>
          </div>
        </div>
      </div>

      <div class="col-span-12 lg:col-span-6 xl:col-span-4 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.currentOrder') }}</h2>
        <div v-if="orderItems.length === 0" class="text-gray-400">
          {{ t('checkout.noItems') }}
        </div>

        <ul>
          <li
            v-for="line in orderItems"
            :key="line.id"
            class="grid grid-cols-6 items-center py-2 border-b border-slate-200"
          >
            <span class="text-left col-span-1">{{ line.quantity }}</span>
            <span class="text-left col-span-2">{{ line.name }}
              <span v-if="line.deposit > 0" class="text-xs text-gray-500">
                {{ t('checkout.depositSuffix', { amount: line.deposit }) }}
              </span>
            </span>
            <span class="text-right font-semibold col-span-2">
              {{ ((line.price * line.quantity) + (line.deposit * line.quantity)).toFixed(2) }} €
            </span>
            <button
              class="col-span-1 flex justify-end cursor-pointer"
              @click="removeLine(line.id)"
            >
              <Icon
                name="ph:x"
                class="w-4 h-4 hover:opacity-70 transition"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>

        <div class="flex flex-rows flex-wrap justify-between">
          <div class="mt-4 font-bold text-lg">
            {{ t('common.total') }}: {{ total.toFixed(2) }} €
          </div>
          <button
            @click="isFachschaft = !isFachschaft"
            class="mt-4 px-4 py-2 rounded-md text-sm cursor-pointer transition-colors"
            :class="isFachschaft
              ? 'bg-green-600 text-white'
              : 'bg-slate-200 text-black hover:bg-slate-300'"
          >
            {{ isFachschaft ? t('checkout.fachschaftMarked') : t('checkout.markFachschaft') }}
          </button>
        </div>

        <!-- Donation section -->
        <div class="mt-4 border-t border-slate-200 pt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm font-semibold text-slate-700">{{ t('checkout.donation') }}</span>
            <div class="ml-auto flex rounded-md border border-slate-200 overflow-hidden text-xs">
              <button
                class="px-3 py-1 cursor-pointer transition-colors"
                :class="donationMode === null
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-white text-slate-400 hover:bg-slate-50'"
                @click="setDonationMode(null)"
              >
                {{ t('checkout.donationNone') }}
              </button>
              <button
                class="px-3 py-1 cursor-pointer transition-colors border-l border-slate-200"
                :class="donationMode === 'direct'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-slate-400 hover:bg-slate-50'"
                @click="setDonationMode('direct')"
              >
                {{ t('checkout.donationDirect') }}
              </button>
              <button
                v-if="orderItems.length > 0 && !isFachschaft"
                class="px-3 py-1 cursor-pointer transition-colors border-l border-slate-200"
                :class="donationMode === 'paid'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-slate-400 hover:bg-slate-50'"
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
              class="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              :placeholder="t('checkout.donationAmountPlaceholder')"
              :value="directDisplayValue"
              @focus="onDirectFocus"
              @input="onDirectInput"
              @blur="onDirectBlur"
            />
            <span class="text-sm text-slate-600">€</span>
          </div>

          <div v-else-if="donationMode === 'paid'" class="space-y-2">
            <div class="flex items-center gap-2">
              <input
                type="text"
                inputmode="decimal"
                class="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
                :class="paidAmountWarning
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-300 focus:ring-orange-400'"
                :placeholder="total.toFixed(2)"
                :value="paidDisplayValue"
                @focus="onPaidFocus"
                @input="onPaidInput"
                @blur="onPaidBlur"
              />
              <span class="text-sm text-slate-600">€</span>
            </div>
            <p v-if="paidAmountWarning" class="text-xs text-red-500">
              {{ t('checkout.paidAmountTooLow', { total: total.toFixed(2) }) }}
            </p>
            <div v-else-if="donationFromPaid > 0" class="flex justify-between text-sm font-semibold text-orange-600">
              <span>{{ t('checkout.donationLabel') }}</span>
              <span>{{ donationFromPaid.toFixed(2) }} €</span>
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
      <span v-if="orderItems.length > 0" class="font-bold">{{ t('common.total') }}: {{ total.toFixed(2) }} €</span>
      <span v-if="effectiveDonation > 0" class="block text-orange-600 font-bold">
        {{ t('checkout.donationLabel') }}: {{ effectiveDonation.toFixed(2) }} €
      </span>
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { sanitizeCurrencyInput, focusAndSelectInput } from '~/composables/useCurrencyInput'

const items = ref<any[]>([])
const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, selectedEvent, orderItems, isFachschaft } = useCheckout()
const { t } = useI18n()
const toast = useToast()
const { onRefresh } = useAppRefresh()

const donationMode = ref<'direct' | 'paid' | null>(null)

// direct donation input state
const directAmount = ref(0)
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
  const parsed = parseFloat(raw)
  directAmount.value = Number.isNaN(parsed) ? 0 : parsed
  ;(e.target as HTMLInputElement).value = raw
}
function onDirectBlur() {
  directFocused.value = false
  directAmount.value = Number(directAmount.value.toFixed(2))
  directRaw.value = ''
}

// paid-amount input state
const paidAmount = ref(0)
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
  const parsed = parseFloat(raw)
  paidAmount.value = Number.isNaN(parsed) ? 0 : parsed
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

async function loadItems() {
  const res = await $fetch('/api/items', { method: 'GET' })
  if (res.ok) {
    const allItems = 'items' in res ? res.items as any[] : []
    items.value = allItems.filter(i => i.is_active === 1 || i.is_active === true)
  }
}

onMounted(loadItems)
onRefresh(loadItems)

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

  let orderId: number | null = null

  if (orderItems.value.length > 0) {
    const res = await $fetch('/api/orders/create', {
      method: 'POST',
      body: {
        cashier_id: selectedCashier.value,
        event_id: selectedEvent.value,
        items: orderItems.value,
        is_fachschaft: isFachschaft.value
      }
    })

    if (!res.ok) {
      toast.error('error' in res && res.error ? String(res.error) : t('checkout.saveFailed'))
      return
    }

    orderId = 'order_id' in res ? Number(res.order_id) : null
  }

  if (effectiveDonation.value > 0) {
    const donRes = await $fetch('/api/donations/create', {
      method: 'POST',
      body: {
        cashier_id: selectedCashier.value,
        event_id: selectedEvent.value,
        amount: effectiveDonation.value,
        order_id: orderId
      }
    })

    if (!donRes.ok) {
      toast.error('error' in donRes && donRes.error ? String(donRes.error) : t('checkout.donationSaveFailed'))
      return
    }
  }

  orderItems.value = []
  isFachschaft.value = false
  setDonationMode(null)

  toast.success(t('checkout.saved'))
}
</script>
