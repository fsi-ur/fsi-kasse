<template>
  <Page :headline1="t('fachschaft.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
      </div>
    </template>

    <template #cards>
      <CommonOfflineNotice v-if="stale" :variant="cachedAt ? 'stale' : 'noData'" :cached-at="cachedAt" />

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
        <button
          class="btn-primary"
          :disabled="!selectedMember || !selectedCashier || !selectedEvent"
          @click="openConfirm"
        >
          {{ t('fachschaft.markPaid', { amount: formattedAmount }) }}
        </button>
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
    </template>
  </FormConfirmation>
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
    }))

  return [...queued, ...payments.value]
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

async function reload() {
  await Promise.allSettled([
    loadSettings(true),
    loadMembers(),
    loadPayments(),
  ])
}

onMounted(reload)
onRefresh(reload)
onOfflineDataChanged(reload)

// Refresh the setting first so the confirmation names the amount that will
// actually be booked, even if another session just changed it.
async function openConfirm() {
  await loadSettings(true)
  showConfirm.value = true
}

async function markPaid() {
  showConfirm.value = false

  if (!selectedCashier.value || !selectedEvent.value || !selectedMember.value) return

  const payload: FachschaftPayPayload = {
    client_uuid: createClientUuid(),
    member_id: Number(selectedMember.value),
    amount: settings.value.fachschaft_payment_amount,
    cashier_id: Number(selectedCashier.value),
    event_id: Number(selectedEvent.value),
  }

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
  paymentsLoading.value = true
  loadPayments()
})
</script>
