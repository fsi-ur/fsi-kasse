<template>
  <Page :headline1="t('overview.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <MenuSelectEvent class="ml-auto" />
    </template>

    <template #cards>
      <div v-if="!selectedEvent" class="col-span-12 text-gray-500">
        {{ t('overview.selectEvent') }}
      </div>

      <template v-else-if="data">
        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.regularSales') }}</h2>

          <ul>
            <li
              v-for="i in data.regular.items"
              :key="i.id"
              class="grid grid-cols-[minmax(0,1fr)_auto_5rem] gap-4 border-b border-slate-200 py-1"
            >
              <span class="truncate">{{ i.name }}</span>
              <span class="text-right">{{ i.quantity }} {{ t('overview.pcs') }}</span>
              <span class="text-right">{{ i.revenue }} €</span>
            </li>
          </ul>

          <div class="text-right font-bold mt-3">
            {{ t('common.total') }}: {{ data.regular.totalRevenue }} €
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.fachschaftGivenOut') }}</h2>

          <ul>
            <li
              v-for="i in data.fachschaft.items"
              :key="i.id"
              class="grid grid-cols-[minmax(0,1fr)_auto_5rem] gap-4 border-b border-slate-200 py-1"
            >
              <span class="truncate">{{ i.name }}</span>
              <span class="text-right">{{ i.quantity }} {{ t('overview.pcs') }}</span>
              <span class="text-right">{{ i.worth }} €</span>
            </li>
          </ul>

          <div class="text-right font-bold mt-3">
            {{ t('common.total') }}: {{ data.fachschaft.totalWorth }} €
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.fachschaftPayments') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.paidMembers') }}</span>
            <span>{{ data.payments.count }}</span>
          </div>

          <div class="flex justify-between font-bold">
            <span>{{ t('overview.revenue') }}</span>
            <span>{{ data.payments.revenue }} €</span>
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.lastHour') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.revenue') }}</span>
            <span>
              {{ data.lastHour.revenue }} €
              <span
                :class="data.lastHour.diffRevenue >= 0 ? 'text-green-600' : 'text-red-600'"
              >
                ({{ data.lastHour.diffRevenue >= 0 ? '+' : '' }}{{ data.lastHour.diffRevenue }} €)
              </span>
            </span>
          </div>

          <div class="flex justify-between">
            <span>{{ t('overview.itemsSold') }}</span>
            <span>
              {{ data.lastHour.quantity }}
              <span
                :class="data.lastHour.diffQuantity >= 0 ? 'text-green-600' : 'text-red-600'"
              >
                ({{ data.lastHour.diffQuantity >= 0 ? '+' : '' }}{{ data.lastHour.diffQuantity }})
              </span>
            </span>
          </div>
        </div>

        <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.hourlySales') }}</h2>

          <div v-if="hourly.length === 0" class="text-gray-400">
            {{ t('overview.noHourlySales') }}
          </div>

          <div v-else class="overflow-x-auto pb-1">
            <div class="flex items-end gap-2 min-w-fit">
              <div
                v-for="entry in hourly"
                :key="entry.hour"
                class="flex flex-col items-center flex-1 min-w-14"
                :title="`${entry.revenue} € — ${entry.quantity} ${t('overview.pcs')}`"
              >
                <span class="text-xs text-slate-600 mb-1 whitespace-nowrap">{{ entry.revenue }} €</span>
                <div
                  class="w-full rounded-t-md bg-orange-500"
                  :style="{ height: `${barHeight(entry.revenue)}px` }"
                ></div>
                <span class="text-xs text-slate-500 mt-1 whitespace-nowrap border-t border-slate-300 w-full text-center pt-1">
                  {{ hourLabel(entry.hour) }}
                </span>
                <span class="text-xs text-slate-400 whitespace-nowrap h-4">
                  {{ dayLabel(entry.hour) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="loading" class="col-span-12 text-gray-500">
        {{ t('common.loading') }}
      </div>
    </template>
  </Page>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'

const { selectedEvent } = useCheckout()
const { t } = useI18n()
const { onRefresh } = useAppRefresh()

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const data = ref<any | null>(null)
const loading = ref(true)

const MAX_BAR_HEIGHT = 160

const hourly = computed<any[]>(() => data.value?.hourly ?? [])
const maxHourlyRevenue = computed(() => hourly.value.reduce((max: number, entry: any) => Math.max(max, Number(entry.revenue)), 0))

function barHeight(revenue: number) {
  if (maxHourlyRevenue.value <= 0) return 2
  const scaled = Math.round((Number(revenue) / maxHourlyRevenue.value) * MAX_BAR_HEIGHT)
  return Math.max(Number(revenue) > 0 ? 4 : 2, scaled)
}

function hourLabel(hour: string) {
  return hour.slice(11, 16)
}

function dayLabel(hour: string) {
  const index = hourly.value.findIndex((entry: any) => entry.hour === hour)
  const date = hour.slice(0, 10)
  if (index > 0 && hourly.value[index - 1].hour.slice(0, 10) === date) return ''
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`
}

async function loadOverview() {
  if (!selectedEvent.value) {
    data.value = null
    loading.value = false
    return
  }

  loading.value = true
  const res = await $fetch(`/api/overview?eventId=${selectedEvent.value}`, { method: 'GET' })
  if (res.ok) data.value = res
  loading.value = false
}

watch(selectedEvent, () => {
  loadOverview()
})

onMounted(loadOverview)
onRefresh(loadOverview)
</script>
