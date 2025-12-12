<template>
  <div class="p-6">
    <div class="flex flex-row justify-between">
      <h1 class="text-2xl font-bold mb-4">Fachschaft Payments</h1>
      <div class="mb-8">
        <select
          v-model="selectedCashier"
          class="bg-white p-2 rounded-md w-64 outline outline-gray-200 shadow-lg"
        >
          <option disabled value="">Choose cashier</option>
          <option v-for="c in cashiers" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="mb-8 p-4 bg-white shadow-lg rounded-xl flex gap-4 items-end">
      <div>
        <label class="block mb-1 text-md">Member Name</label>
        <select
          v-model="selectedMember"
          class="p-2 w-64 outline outline-gray-300 bg-gray-100 rounded-md"
        >
          <option disabled value="">Choose member</option>
          <option v-for="c in cashiers" :key="c.id" :value="c.id">
            {{ c.name }}
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

    <div class="bg-white p-4 rounded-xl shadow-lg">
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
  </div>

  <div
    v-if="showConfirm"
    class="fixed inset-0 bg-gray-200 flex items-center justify-center z-50"
  >
    <div class="bg-white p-6 rounded-lg w-96 shadow-xl">
      <h2 class="text-xl font-bold mb-4 text-center">Confirm Order</h2>
      <p class="text-center mb-6">
        Did {{ members.find((m : any) => m.id === selectedMember).name }} really pay the 10€?<br />
      </p>
      <div class="flex justify-between">
        <button
          @click="markPaid"
          class="px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-700 rounded-md cursor-pointer"
        >
          Confirm
        </button>
        <button
          @click="showConfirm = false"
          class="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-md cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const members = ref<any[]>([])
const payments = ref<any[]>([])
const cashiers = ref<any[]>([])
const selectedMember = ref<number | string>('')

const showConfirm = ref(false)

const { selectedCashier } = useCheckout()

function formatDate(ts: string | Date) {
  return new Date(ts).toLocaleString('de-DE')
}

onMounted(async () => {
  const res1 = await $fetch('/api/cashiers', { method: 'GET' })
  if (res1.ok) {
    members.value = 'cashiers' in res1 ? res1.cashiers as any[] : []
  }

  const res3 = await $fetch('/api/cashiers', { method: 'GET' })
  if (res3.ok) {
    const allCashiers = 'cashiers' in res3 ? res3.cashiers as any[] : []
    cashiers.value = allCashiers.filter(c => c.is_active == 1)
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