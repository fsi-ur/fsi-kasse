<template>
  <Page :headline1="t('checkout.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectCashier />
        <MenuSelectEvent />
      </div>
    </template>

    <template #cards>
      <div class="col-span-12 lg:col-span-6 xl:col-span-8 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.items') }}</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="item in items"
            :key="item.id"
            class="bg-gray-100 border border-slate-200 p-4 rounded-lg cursor-pointer transition-colors hover:bg-gray-200"
            @click="addToOrder(item)"
          >
            <div class="text-lg font-bold">{{ item.name }}</div>
            <div class="text-sm text-slate-600">{{ item.price }} €</div>
          </div>
        </div>
      </div>

      <div class="col-span-12 lg:col-span-6 xl:col-span-4 bg-white p-4 rounded-xl shadow-lg">
        <h2 class="text-lg font-semibold mb-4">{{ t('checkout.currentOrder') }}</h2>
        <div v-if="orderItems.length === 0" class="text-gray-400">
          {{ t('checkout.noItems') }}
        </div>

        <ul>
          <li
            v-for="line in orderItems"
            :key="line.id"
            class="grid grid-cols-6 items-center py-2 border-b border-slate-200"
          >
            <span class="text-left col-span-1">{{ line.quantity }}</span>
            <span class="text-left col-span-2">{{ line.name }}
              <span v-if="line.deposit > 0" class="text-xs text-gray-500">
                {{ t('checkout.depositSuffix', { amount: line.deposit }) }}
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
            {{ t('common.total') }}: {{ total.toFixed(2) }} €
          </div>
          <button
            @click="isFachschaft = !isFachschaft"
            class="mt-4 px-4 py-2 rounded-md text-sm cursor-pointer transition-colors"
            :class="isFachschaft
              ? 'bg-green-600 text-white'
              : 'bg-slate-200 text-black hover:bg-slate-300'"
          >
            {{ isFachschaft ? t('checkout.fachschaftMarked') : t('checkout.markFachschaft') }}
          </button>
        </div>

        <button
          class="btn-primary mt-4 w-full p-3"
          :disabled="orderItems.length === 0 || !selectedCashier || !selectedEvent"
          @click="showConfirm = true"
        >
          {{ t('checkout.saveOrder') }}
        </button>
      </div>
    </template>
  </Page>
  <FormConfirmation
    v-if="showConfirm"
    :headline="t('checkout.confirmTitle')"
    @confirm="finishOrder"
    @cancel="showConfirm = false"
  >
    <template #message>
      {{ t('checkout.confirmQuestion') }}<br />
      <span class="font-bold">{{ t('common.total') }}: {{ total.toFixed(2) }} €</span>
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'

const items = ref<any[]>([])
const showConfirm = ref(false)

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const { selectedCashier, selectedEvent, orderItems, isFachschaft } = useCheckout()
const { t } = useI18n()
const toast = useToast()
const { onRefresh } = useAppRefresh()

async function loadItems() {
  const res = await $fetch('/api/items', { method: 'GET' })
  if (res.ok) {
    const allItems = 'items' in res ? res.items as any[] : []
    items.value = allItems.filter(i => i.is_active === 1 || i.is_active === true)
  }
}

onMounted(loadItems)
onRefresh(loadItems)

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
      event_id: selectedEvent.value,
      items: orderItems.value,
      is_fachschaft: isFachschaft.value
    }
  })

  if (res.ok) {
    orderItems.value = []
    isFachschaft.value = false
    toast.success(t('checkout.saved'))
  } else {
    toast.error('error' in res && res.error ? String(res.error) : t('checkout.saveFailed'))
  }
}
</script>
