<template>
  <Page :headline1="t('fachschaft.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
        <!-- Card payments run on the selected stand's terminal -->
        <MenuSelectStand v-if="cardVisible" />
      </div>
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="stale" :variant="cachedAt ? 'stale' : 'noData'" :cached-at="cachedAt" />

      <div
        v-if="disabledReason"
        class="col-span-12 p-4 bg-warning-50 text-warning-900 shadow-lg rounded-xl border border-warning-200 text-sm"
      >
        {{ disabledReason }}
      </div>

      <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl flex flex-wrap gap-4 items-end">
        <div class="field w-64">
          <label>{{ t('fachschaft.memberName') }}</label>
          <CommonSearchSelect
            v-model="memberQuery"
            :options="memberOptions"
            :placeholder="t('fachschaft.memberPlaceholder')"
            :empty-text="t('fachschaft.noMembers')"
            :selected-label="selectedMemberLabel"
            @select="onMemberSelect"
            @clear-selection="selectedMember = ''"
          />
        </div>
        <div v-if="cardOffered" class="field">
          <label>{{ t('card.method') }}</label>
          <div class="flex rounded-lg border border-base-300 overflow-hidden text-sm" role="radiogroup" :aria-label="t('card.method')">
            <button
              type="button"
              role="radio"
              :aria-checked="paymentMethod === 'cash'"
              class="flex items-center justify-center gap-1.5 px-3 py-2 cursor-pointer transition-colors"
              :class="paymentMethod === 'cash' ? 'bg-accent-500 text-white' : 'bg-white text-base-600 hover:bg-base-50'"
              @click="paymentMethod = 'cash'"
            >
              <Icon name="material-symbols:payments-outline-rounded" class="h-4 w-4" aria-hidden="true" />
              {{ t('card.cash') }}
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="paymentMethod === 'card'"
              class="flex items-center justify-center gap-1.5 px-3 py-2 border-l border-base-300 transition-colors not-disabled:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              :class="paymentMethod === 'card' ? 'bg-accent-500 text-white' : 'bg-white text-base-600 not-disabled:hover:bg-base-50'"
              :disabled="Boolean(unavailableReason)"
              @click="paymentMethod = 'card'"
            >
              <Icon name="material-symbols:credit-card-outline" class="h-4 w-4" aria-hidden="true" />
              {{ t('card.card') }}
            </button>
          </div>
        </div>
        <button
          class="btn-primary py-2.25"
          :disabled="!selectedMember || !selectedCashier || !selectedEvent || !!disabledReason || cardBlocked || submitting"
          @click="openConfirm"
        >
          {{ payingByCard
            ? t('card.payWithCard', { amount: formattedAmount })
            : t('fachschaft.markPaid', { amount: formattedAmount }) }}
        </button>
        <p v-if="selectionHint" class="basis-full text-xs text-warning-700">{{ selectionHint }}</p>
        <p v-if="cardOffered && unavailableReason" class="basis-full text-xs text-base-500">{{ unavailableReason }}</p>
      </div>

      <CommonPageTableCard
        :title="t('fachschaft.paymentHistory')"
        persist-key="fachschaft-payments"
        :search-value="paymentSearch"
        @update:search-value="paymentSearch = $event"
      >
        <CommonAdvancedTable
          v-model:search="paymentSearch"
          persist-key="fachschaft-payments"
          :rows="paymentRows"
          :loading="paymentsLoading"
          :columns="paymentColumns"
          :empty-text="t('fachschaft.noPayments')"
          :show-actions="false"
          :can-open-row="() => false"
        >
          <template #cell-status="{ row }">
            <CommonStatusBadge
              v-if="row.outboxStatus"
              :label="row.outboxStatus === 'failed' ? t('offline.statusFailed') : t('offline.statusPending')"
              :tone="row.outboxStatus === 'failed' ? 'danger' : 'warning'"
            />
            <span v-else>{{ t('fachschaft.statusBooked') }}</span>
          </template>

          <template #cell-payment_method="{ row }">
            <CommonStatusBadge
              :label="row.payment_method === 'card' ? t('card.card') : t('card.cash')"
              :tone="row.payment_method === 'card' ? 'base' : 'baseMuted'"
            />
          </template>
        </CommonAdvancedTable>
      </CommonPageTableCard>
    </template>
  </Page>

  <FormConfirmation
    v-if="showConfirm"
    :headline="t('fachschaft.confirmTitle')"
    @confirm="markPaid"
    @cancel="showConfirm = false"
  >
    <template #message>
      {{ t('fachschaft.confirmQuestion', { name: selectedMemberLabel, amount: formattedAmount }) }}
      <span v-if="payingByCard" class="mt-2 block font-bold text-accent-700">
        {{ t('card.confirmCharge', { amount: formattedAmount }) }}
      </span>
      <span v-else-if="cardOffered" class="mt-2 block text-base-600">{{ t('card.confirmCash') }}</span>
    </template>
  </FormConfirmation>

  <CardPaymentModal
    kind="fachschaft_payment"
    :back-label="t('card.modal.back')"
    @retry-card="retryCard"
    @pay-cash="payCashInstead"
    @back="cardPayment.dismiss()"
    @acknowledge="acknowledgeCardPayment"
  />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { AdvancedTableColumn } from '~/composables/useAdvancedTable'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged, useOfflineQueue, type FachschaftPayPayload } from '~/composables/useOfflineQueue'
import { createClientUuid } from '~/utils/network'
import { positiveIdOrEmpty, usePersistedState } from '~/composables/usePersistedState'
import { useCardAvailability, useCardPayment } from '~/composables/useCardPayment'

const members = ref<any[]>([])
const payments = ref<any[]>([])
const paymentsLoading = ref(true)
const paymentSearch = ref('')
const selectedMember = usePersistedState<number | string>('fachschaftMember', () => '', positiveIdOrEmpty)
const memberQuery = ref('')
const stale = ref(false)
const cachedAt = ref<number | null>(null)

const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, selectedEvent, selectedCashierName, selectedEventName } = useCheckout()
const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const toast = useToast()
const { settings, loadSettings } = useCashRegisterSettings()
const { onRefresh } = useAppRefresh()
const { entries: outboxEntries, submit } = useOfflineQueue()
const { effectiveStand } = useStands()
const cardPayment = useCardPayment()
const { cardVisible, cardOffered, unavailableReason, loadAvailability } = useCardAvailability()

const submitting = ref(false)
const paymentMethod = usePersistedState<'cash' | 'card'>('fachschaftPaymentMethod', () => 'cash',
  stored => stored === 'cash' || stored === 'card' ? stored : undefined)
const payingByCard = computed(() => cardOffered.value && paymentMethod.value === 'card')
const cardBlocked = computed(() => payingByCard.value && Boolean(unavailableReason.value))

const paymentRows = computed(() => {
  const queued = outboxEntries.value
    .filter(entry => entry.kind === 'fachschaft_payment' && Number(entry.payload.event_id) === Number(selectedEvent.value))
    .map(entry => ({
      id: `outbox-${entry.client_uuid}`,
      member: entry.display.summary,
      cashier: entry.display.cashierName,
      amount: entry.display.localTotal,
      created_at: new Date(entry.queued_at).toISOString(),
      outboxStatus: entry.status,
      payment_method: 'cash',
    }))

  return [...queued, ...payments.value]
})

const eventFachschaftEnabled = ref(true)

const disabledReason = computed(() => {
  if (!settings.value.fachschaft_enabled) return t('fachschaft.disabledGlobal')
  if (!eventFachschaftEnabled.value) return t('fachschaft.disabledEvent')
  return ''
})

/** Explains a disabled pay button; skipped while the feature itself is off (shown above). */
const selectionHint = computed(() => {
  if (disabledReason.value) return null
  if (!selectedCashier.value) return t('select.cashierRequired')
  if (!selectedEvent.value) return t('select.eventRequired')
  if (!selectedMember.value) return t('fachschaft.memberRequired')
  return null
})

const formattedAmount = computed(() => formatCurrency(settings.value.fachschaft_payment_amount))

const memberOptions = computed<SearchSelectOption[]>(() => members.value
  .filter(member => member.is_active === 1 || member.is_active === true)
  .map(member => ({
    key: member.id,
    label: String(member.name),
    value: member.id,
  })))

const selectedMemberLabel = computed(() => {
  const member = members.value.find(entry => entry.id === selectedMember.value)
  return member ? String(member.name) : ''
})

function onMemberSelect(value: unknown) {
  selectedMember.value = Number(value)
  memberQuery.value = ''
}

const paymentColumns: AdvancedTableColumn<any>[] = [
  {
    key: 'member',
    label: t('fachschaft.memberName'),
    globalSearchable: true,
    mobile: 'title',
    getValue: payment => payment.member,
  },
  {
    key: 'cashier',
    label: t('history.cashierLabel'),
    globalSearchable: true,
    getValue: payment => payment.cashier,
  },
  {
    key: 'created_at',
    label: t('users.createdAt'),
    filterType: 'date',
    getValue: payment => payment.created_at,
    format: payment => formatDateTime(payment.created_at),
  },
  {
    key: 'amount',
    label: t('common.total'),
    filterType: 'number',
    getValue: payment => Number(payment.amount),
    format: payment => formatCurrency(Number(payment.amount)),
  },
  {
    key: 'payment_method',
    label: t('card.method'),
    filterable: true,
    getValue: payment => payment.payment_method === 'card' ? t('card.card') : t('card.cash'),
  },
  {
    key: 'status',
    label: t('fachschaft.status'),
    filterable: true,
    getValue: payment => payment.outboxStatus === 'failed'
      ? t('offline.statusFailed')
      : payment.outboxStatus === 'pending' ? t('offline.statusPending') : t('fachschaft.statusBooked'),
  },
]

async function loadMembers() {
  const { data: res, stale } = await cachedFetch<any>('/api/cashiers')
  if (res.ok) {
    members.value = 'cashiers' in res ? res.cashiers as any[] : []

    const stillSelectable = memberOptions.value.some(option => option.value === selectedMember.value)
    if (!stale && selectedMember.value && !stillSelectable) selectedMember.value = ''
  }
}

async function loadEventFlag() {
  try {
    const { data: res } = await cachedFetch<any>('/api/events')
    if (!res.ok || !Array.isArray(res.events)) return
    const current = res.events.find((entry: any) => entry.id === selectedEvent.value)
    eventFachschaftEnabled.value = current ? Boolean(current.fachschaft_enabled) : true
  } catch {
    // keep the last known value
  }
}

async function reload() {
  await Promise.allSettled([
    loadAvailability(true),
    loadSettings(true),
    loadEventFlag(),
    loadMembers(),
    loadPayments(),
  ])
}

onMounted(() => {
  reload()
  if (cardPayment.active.value?.kind === 'fachschaft_payment') cardPayment.resume()
})
onRefresh(reload)
onOfflineDataChanged(reload)

// Refresh the setting first so the confirmation names the amount that will
// actually be booked, even if another session just changed it.
async function openConfirm() {
  await Promise.allSettled([loadSettings(true), loadEventFlag()])
  if (disabledReason.value) return
  showConfirm.value = true
}

function buildPayload(): FachschaftPayPayload {
  return {
    client_uuid: createClientUuid(),
    member_id: Number(selectedMember.value),
    amount: settings.value.fachschaft_payment_amount,
    cashier_id: Number(selectedCashier.value),
    event_id: Number(selectedEvent.value),
  }
}

async function markPaid() {
  showConfirm.value = false

  if (!selectedCashier.value || !selectedEvent.value || !selectedMember.value) return
  if (submitting.value) return
  submitting.value = true
  try {
    if (payingByCard.value) await payByCard()
    else await payCash()
  } finally {
    submitting.value = false
  }
}

async function payCash() {
  const payload = buildPayload()

  let outcome
  try {
    outcome = await submit('fachschaft_payment', payload, {
      cashierName: selectedCashierName.value,
      eventName: selectedEventName.value,
      summary: selectedMemberLabel.value,
      localTotal: settings.value.fachschaft_payment_amount,
    })
  } catch {
    toast.error(t('common.unknownError'))
    return
  }

  if (outcome.status === 'rejected') {
    toast.error(outcome.error ?? t('fachschaft.payFailed'))
  } else if (outcome.status === 'queued') {
    toast.info(t('offline.savedOffline'))
    return
  }

  await loadPayments()
}

/** Pushes the payment to the selected stand's terminal; the server books it once SumUp reports success. */
async function payByCard() {
  if (unavailableReason.value) {
    toast.error(unavailableReason.value)
    return
  }
  const stand = effectiveStand.value
  const result = await cardPayment.start('fachschaft_payment', buildPayload(), {
    standId: stand?.id ?? null,
    amount: settings.value.fachschaft_payment_amount,
    standName: stand?.name ?? null,
    readerName: stand?.card_reader_name ?? null,
  })
  if (!result.ok) toast.error(result.error)
}

watch(() => cardPayment.payment.value, async (state) => {
  if (!state || state.kind !== 'fachschaft_payment' || state.status !== 'booked') return
  if (cardPayment.active.value?.client_uuid !== state.client_uuid) return
  cardPayment.dismiss()
  toast.success(t('card.paid'))
  await loadPayments()
})

async function retryCard() {
  cardPayment.dismiss()
  if (submitting.value) return
  submitting.value = true
  try {
    await payByCard()
  } finally {
    submitting.value = false
  }
}

async function payCashInstead() {
  cardPayment.dismiss()
  paymentMethod.value = 'cash'
  if (submitting.value) return
  submitting.value = true
  try {
    await payCash()
  } finally {
    submitting.value = false
  }
}

async function acknowledgeCardPayment() {
  cardPayment.dismiss()
  await loadPayments()
}

async function loadPayments() {
  try {
    const result = await cachedFetch<any>(`/api/fachschaft/payments?eventId=${selectedEvent.value}`)
    stale.value = result.stale
    cachedAt.value = result.cachedAt
    if (result.data.ok && 'payments' in result.data) payments.value = result.data.payments
  } catch {
    payments.value = []
    stale.value = true
    cachedAt.value = null
  } finally {
    paymentsLoading.value = false
  }
}

watch(selectedEvent, () => {
  loadEventFlag()
  paymentsLoading.value = true
  loadPayments()
})
</script>
