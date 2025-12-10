<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Order History</h1>

    <div v-if="loading" class="text-gray-500">Loading…</div>

    <div v-else>
      <div
        v-for="order in orders"
        :key="order.id"
        class="bg-white p-4 rounded-lg shadow mb-4"
      >
        <div
          class="flex justify-between items-center cursor-pointer"
          @click="toggle(order.id)"
        >
          <div>
            <div class="font-semibold">
              Order #{{ order.id }} - Total:
            {{
              order.items
                .reduce((s : any, i : any) => s + i.price * i.quantity, 0)
                .toFixed(2)
            }}
            €
            </div>
            <div class="text-sm text-gray-500">
              Cashier: {{ order.cashier }} — {{ formatDate(order.created_at) }}
            </div>
          </div>

          <span class="text-xl">
            {{ opened[order.id] ? '▾' : '▸' }}
          </span>
        </div>

        <div v-if="opened[order.id]" class="mt-4 border-t pt-4">
          <ul>
            <li
              v-for="item in order.items"
              :key="item.id"
              class="grid grid-cols-6 py-2 border-b"
            >
              <span class="col-span-1">{{ item.quantity }}</span>
              <span class="col-span-3">{{ item.name }}</span>
              <span class="col-span-2 text-right">
                {{ (item.price * item.quantity).toFixed(2) }} €
              </span>
            </li>
          </ul>

          <div class="text-right font-bold mt-3">
            Total:
            {{
              order.items
                .reduce((s : any, i : any) => s + i.price * i.quantity, 0)
                .toFixed(2)
            }}
            €
          </div>
        </div>
      </div>

      <div v-if="orders.length === 0" class="text-gray-400 mt-8">
        No orders yet.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const orders = ref<any[]>([])
const loading = ref(true)
const opened = ref<Record<number, boolean>>({})

function toggle(id: number) {
  opened.value[id] = !opened.value[id]
}

function formatDate(ts: string | Date) {
  return new Date(ts).toLocaleString('de-DE')
}

onMounted(async () => {
  const res = await $fetch('/api/orders/history')

  if (res.ok) orders.value = 'orders' in res ? res.orders : []
  loading.value = false
})
</script>
