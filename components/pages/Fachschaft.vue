<template>
  <Page :headline1="t('fachschaft.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
      </div>
    </template>

    <template #cards>
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
          :rows="payments"
          :columns="paymentColumns"
          :empty-text="t('fachschaft.noPayments')"
          :show-actions="false"
          :can-open-row="() => false"
        />
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

const members = ref<any[]>([])
const payments = ref<any[]>([])
const paymentSearch = ref('')
const selectedMember = ref<number | string>('')
const memberQuery = ref('')

const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, selectedEvent } = useCheckout()
const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const toast = useToast()
const { settings, loadSettings } = useCashRegisterSettings()
const { onRefresh } = useAppRefresh()

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
]

async function loadMembers() {
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok) {
    members.value = 'cashiers' in res ? res.cashiers as any[] : []
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

// Refresh the setting first so the confirmation names the amount that will
// actually be booked, even if another session just changed it.
async function openConfirm() {
  await loadSettings(true)
  showConfirm.value = true
}

async function markPaid() {
  showConfirm.value = false

  if (!selectedCashier.value || !selectedEvent.value || !selectedMember.value) return

  const res = await $fetch('/api/fachschaft/pay', {
    method: 'POST',
    body: {
      member_id: selectedMember.value,
      cashier_id: selectedCashier.value,
      event_id: selectedEvent.value,
    }
  })

  if (!res.ok) {
    toast.error('error' in res && res.error ? String(res.error) : t('fachschaft.payFailed'))
  }

  await loadPayments()
}

async function loadPayments() {
  const res2 = await $fetch(`/api/fachschaft/payments?eventId=${selectedEvent.value}`)
  if (res2.ok) {
    if ('payments' in res2) payments.value = res2.payments
  }
}

watch(selectedEvent, () => {
  loadPayments()
})
</script>
