<template>
  <Page headline1="Order History" @open-menu="$emit('openMenu')">
    <template #cards>
      <div v-if="loading" class="col-span-12 text-gray-500">Loading…</div>

      <div v-else class="col-span-12">
        <div
          v-for="order in orders"
          :key="order.id"
          class="bg-white p-4 rounded-xl shadow-lg mb-4"
        >
          <div
            class="flex justify-between items-center cursor-pointer"
            @click="toggle(order.id)"
          >
            <div>
              <div class="font-semibold">
                Order #{{ order.id }} - Total:
              {{
                order.is_fachschaft
                  ? '0.00'
                  : order.items
                    .reduce((s : any, i : any) => s + (i.price * i.quantity) + (i.deposit * i.quantity), 0)
                    .toFixed(2)
              }}
              €
              </div>
              <div class="text-sm text-gray-500">
                Cashier: {{ order.cashier }} — {{ formatDate(order.created_at) }}
              </div>
              <div
                v-if="order.is_fachschaft"
                class="text-xs mt-1 inline-block px-2 py-1 bg-green-100 text-green-700 rounded"
              >
                Fachschaft Order (Free)
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
                <span class="col-span-3">{{ item.name }}
                  <span
                    v-if="item.deposit > 0"
                    class="text-xs text-gray-500"
                  >
                    (+{{ item.deposit }} € deposit)
                  </span>
                </span>
                <span class="col-span-2 text-right">
                  {{ ((item.price * item.quantity) + (item.deposit * item.quantity)).toFixed(2) }} €
                </span>
              </li>
            </ul>

            <div class="text-right font-bold mt-3">
              Total:
              {{
                order.items
                  .reduce((s : any, i : any) => s + (i.price * i.quantity) + (i.deposit * i.quantity), 0)
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
    </template>
  </Page>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

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
