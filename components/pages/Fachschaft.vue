<template>
  <Page headline1="Fachschaft Payments" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectCashier />
    </template>

    <template #cards>
      <div class="col-span-12 p-4 bg-white shadow-lg rounded-xl flex flex-wrap gap-4 items-end">
        <div>
          <label class="block mb-1 text-md">Member Name</label>
          <select
            v-model="selectedMember"
            class="p-2 w-64 outline outline-gray-300 bg-gray-100 rounded-md"
          >
            <option disabled value="">Choose member</option>
            <option v-for="m in members" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
        </div>
        <button
          class="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 cursor-pointer disabled:bg-gray-400"
          :disabled="!selectedMember || !selectedCashier"
          @click="showConfirm = true"
        >
          Mark Paid (10€)
        </button>
      </div>

      <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">Payment History</h2>
        <ul>
          <li
            v-for="p in payments"
            :key="p.id"
            class="py-2 border-b border-gray-300"
          >
            <div class="font-semibold">{{ p.member }}</div>
            <div class="text-sm text-gray-500">
              Cashier: {{ p.cashier }} — {{ formatDate(p.created_at) }}
            </div>
          </li>
        </ul>
        <div v-if="payments.length === 0" class="text-gray-400">
          No payments yet.
        </div>
      </div>
    </template>
  </Page>

  <FormConfirmation
    v-if="showConfirm"
    headline="Confirm Payment"
    @confirm="markPaid"
    @cancel="showConfirm = false"
  >
    <p class="text-center mb-6">
      Did {{ members.find((m : any) => m.id === selectedMember).name }} really pay the 10€?<br />
    </p>
  </FormConfirmation>
</template>

<script setup lang="ts">
const members = ref<any[]>([])
const payments = ref<any[]>([])
const selectedMember = ref<number | string>('')

const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier } = useCheckout()

function formatDate(ts: string | Date) {
  return new Date(ts).toLocaleString('de-DE')
}

onMounted(async () => {
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok) {
    members.value = 'cashiers' in res ? res.cashiers as any[] : []
  }

  await loadPayments()
})

async function markPaid() {
  showConfirm.value = false

  if (!selectedCashier.value || !selectedMember.value) return

  const res = await $fetch('/api/fachschaft/pay', {
    method: 'POST',
    body: {
      member_id: selectedMember.value,
      cashier_id: selectedCashier.value,
    }
  })

  await loadPayments()
}

async function loadPayments() {
  const res2 = await $fetch('/api/fachschaft/payments')
  if (res2.ok) {
    if ('payments' in res2) payments.value = res2.payments
  }
}
</script>