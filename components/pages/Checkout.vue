<template>
  <Page headline1="Checkout" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectCashier />
    </template>

    <template #cards>
      <div class="col-span-12 lg:col-span-6 xl:col-span-8 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4">Items</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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

      <div class="col-span-12 lg:col-span-6 xl:col-span-4 bg-white p-4 rounded-xl shadow-lg">
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
    </template>
  </Page>
  <FormConfirmation 
    v-if="showConfirm" 
    headline="Confirm Order"
    @confirm="finishOrder"
    @cancel="showConfirm = false"
  >
    <template #message>
      Do you really want to create this order?<br />
      <span class="font-bold">Total: {{ total.toFixed(2) }} €</span>
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
const items = ref<any[]>([])
const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, orderItems, isFachschaft } = useCheckout()

onMounted(async () => {
  const res = await $fetch('/api/items', { method: 'GET' })
  if (res.ok) { 
    const allItems = 'items' in res ? res.items as any[] : []
    items.value = allItems.filter(i => i.is_active === 1 || i.is_active === true)
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