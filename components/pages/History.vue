<template>
  <Page :headline1="t('history.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectEvent class="ml-auto" />
    </template>

    <template #cards>
      <div v-if="loading" class="col-span-12 text-gray-500">{{ t('common.loading') }}</div>

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
                {{ t('history.order', { id: order.id }) }} — {{ t('common.total') }}:
                {{
                  order.is_fachschaft
                    ? '0.00'
                    : orderTotal(order)
                }}
                €
              </div>
              <div class="text-sm text-gray-500">
                {{ t('history.cashier', { name: order.cashier }) }} — {{ formatDate(order.created_at) }}
              </div>
              <div
                v-if="order.is_fachschaft"
                class="text-xs mt-1 inline-block px-2 py-1 bg-green-100 text-green-700 rounded"
              >
                {{ t('history.fachschaftBadge') }}
              </div>
            </div>

            <Icon
              :name="opened[order.id] ? 'material-symbols:keyboard-arrow-down-rounded' : 'material-symbols:keyboard-arrow-right'"
              class="w-6 h-6 shrink-0 text-slate-500"
              aria-hidden="true"
            />
          </div>

          <div v-if="opened[order.id]" class="mt-4 border-t border-slate-200 pt-4">
            <ul>
              <li
                v-for="item in order.items"
                :key="item.id"
                class="grid grid-cols-6 py-2 border-b border-slate-200"
              >
                <span class="col-span-1">{{ item.quantity }}</span>
                <span class="col-span-3">{{ item.name }}
                  <span
                    v-if="item.deposit > 0"
                    class="text-xs text-gray-500"
                  >
                    {{ t('checkout.depositSuffix', { amount: item.deposit }) }}
                  </span>
                </span>
                <span class="col-span-2 text-right">
                  {{ ((item.price * item.quantity) + (item.deposit * item.quantity)).toFixed(2) }} €
                </span>
              </li>
            </ul>

            <div class="text-right font-bold mt-3">
              {{ t('common.total') }}: {{ orderTotal(order) }} €
            </div>
          </div>
        </div>

        <div v-if="orders.length === 0" class="text-gray-400 mt-8">
          {{ t('history.noOrders') }}
        </div>
      </div>
    </template>
  </Page>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const { selectedEvent } = useCheckout()
const { t, locale } = useI18n()
const { onRefresh } = useAppRefresh()

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
  return new Date(ts).toLocaleString(locale.value)
}

function orderTotal(order: any) {
  return order.items
    .reduce((s: any, i: any) => s + (i.price * i.quantity) + (i.deposit * i.quantity), 0)
    .toFixed(2)
}

async function loadHistory() {
  const res = await $fetch(`/api/orders/history?eventId=${selectedEvent.value}`)

  if (res.ok) orders.value = 'orders' in res ? res.orders : []
  loading.value = false
}

onMounted(loadHistory)
onRefresh(loadHistory)

watch(selectedEvent, () => {
  loadHistory()
})
</script>
