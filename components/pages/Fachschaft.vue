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
          @click="showConfirm = true"
        >
          {{ t('fachschaft.markPaid', { amount: formattedAmount }) }}
        </button>
      </div>

      <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('fachschaft.paymentHistory') }}</h2>
        <ul>
          <li
            v-for="p in payments"
            :key="p.id"
            class="py-2 border-b border-slate-200"
          >
            <div class="font-semibold">{{ p.member }}</div>
            <div class="text-sm text-gray-500">
              {{ t('history.cashier', { name: p.cashier }) }} — {{ formatDate(p.created_at) }}
            </div>
          </li>
        </ul>
        <div v-if="payments.length === 0" class="text-gray-400">
          {{ t('fachschaft.noPayments') }}
        </div>
      </div>
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

const members = ref<any[]>([])
const payments = ref<any[]>([])
const selectedMember = ref<number | string>('')
const memberQuery = ref('')

const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, selectedEvent } = useCheckout()
const { t, locale } = useI18n()
const toast = useToast()
const { settings, loadSettings } = useCashRegisterSettings()
const { onRefresh } = useAppRefresh()

const formattedAmount = computed(() => settings.value.fachschaft_payment_amount.toLocaleString(locale.value))

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

function formatDate(ts: string | Date) {
  const d = typeof ts === 'string' && !/[Z+\-]\d{2}:?\d{2}$/.test(ts) && !ts.endsWith('Z')
    ? new Date(ts.replace(' ', 'T') + 'Z')
    : new Date(ts)
  return d.toLocaleString(locale.value, { timeZone: 'Europe/Berlin' })
}

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
