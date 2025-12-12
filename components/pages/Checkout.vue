<template>
  <div class="p-6">
    <div class="flex flex-row justify-between">
      <h1 class="text-2xl font-bold mb-4">Checkout</h1>
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

    <div class="grid grid-cols-3 gap-6">
      <div class="col-span-2 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">Items</h2>
        <div class="grid grid-cols-3 gap-4">
          <div
            v-for="item in items"
            :key="item.id"
            class="bg-gray-200 p-4 rounded-lg cursor-pointer hover:bg-gray-300"
            @click="addToOrder(item)"
          >
            <div class="text-lg font-bold">{{ item.name }}</div>
            <div class="text-sm">{{ item.price }} €</div>
          </div>
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">Current Order</h2>
        <div v-if="orderItems.length === 0" class="text-gray-400">
          No items added yet.
        </div>

        <ul>
          <li
            v-for="line in orderItems"
            :key="line.id"
            class="grid grid-cols-6 items-center py-2 border-b border-gray-700"
          >
            <span class="text-left col-span-1">{{ line.quantity }}</span>
            <span class="text-left col-span-2">{{ line.name }}
              <span v-if="line.deposit > 0" class="text-xs text-gray-500">
                (+ {{ line.deposit }} € deposit)
              </span>
            </span>
            <span class="text-right font-semibold col-span-2">
              {{ ((line.price * line.quantity) + (line.deposit * line.quantity)).toFixed(2) }} €
            </span>
            <button
              class="col-span-1 flex justify-end cursor-pointer"
              @click="removeLine(line.id)"
            >
              <img
                src="/icon-cancel.svg"
                alt="Remove"
                class="w-4 h-4 hover:opacity-70 transition"
              />
            </button>
          </li>
        </ul>

        <div class="flex flex-rows justify-between">
          <div class="mt-4 font-bold text-lg">
            Total: {{ total.toFixed(2) }} €
          </div>
          <button
            @click="isFachschaft = !isFachschaft"
            class="mt-4 px-4 rounded-md shadow-md text-sm cursor-pointer"
            :class="isFachschaft
              ? 'bg-green-600 text-white'
              : 'bg-gray-300 text-gray-800'"
          >
            {{ isFachschaft ? 'Fachschaft Order ✓' : 'Mark as Fachschaft Order' }}
          </button>
        </div>

        <button
          class="mt-4 w-full bg-cyan-600 hover:bg-cyan-700 text-white cursor-pointer p-3 rounded-lg disabled:bg-gray-600"
          :disabled="orderItems.length === 0 || !selectedCashier"
          @click="showConfirm = true"
        >
          Save Order
        </button>
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
        Do you really want to create this order?<br />
        <span class="font-bold">Total: {{ total.toFixed(2) }} €</span>
      </p>
      <div class="flex justify-between">
        <button
          @click="finishOrder"
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
const items = ref<any[]>([])
const cashiers = ref<any[]>([])

const showConfirm = ref(false)

const { selectedCashier, orderItems, isFachschaft } = useCheckout()

onMounted(async () => {
  const res1 = await $fetch('/api/items', { method: 'GET' })
  if (res1.ok) { 
    const allItems = 'items' in res1 ? res1.items as any[] : []
    items.value = allItems.filter(i => i.is_active === 1 || i.is_active === true)
  }

  const res2 = await $fetch('/api/cashiers', { method: 'GET' })
  if (res2.ok) {
    const allCashiers = 'cashiers' in res2 ? res2.cashiers as any[] : []
    cashiers.value = allCashiers.filter(i => i.is_active === 1 || i.is_active === true)
  }
})

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

  const res = await $fetch('/api/orders/create', {
    method: 'POST',
    body: {
      cashier_id: selectedCashier.value,
      items: orderItems.value,
      is_fachschaft: isFachschaft.value
    }
  })

  if (res.ok) {
    orderItems.value = []
    isFachschaft.value = false
  }
}
</script>