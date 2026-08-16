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
              <span class="text-right">{{ formatCurrency(Number(i.revenue)) }}</span>
            </li>
          </ul>

          <div class="text-right font-bold mt-3">
            {{ t('common.total') }}: {{ formatCurrency(data.regular.totalRevenue) }}
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
              <span class="text-right">{{ formatCurrency(Number(i.worth)) }}</span>
            </li>
          </ul>

          <div class="text-right font-bold mt-3">
            {{ t('common.total') }}: {{ formatCurrency(data.fachschaft.totalWorth) }}
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
            <span>{{ formatCurrency(Number(data.payments.revenue)) }}</span>
          </div>

          <div v-if="paymentAmounts.length > 1" class="mt-2 text-sm text-slate-500">
            {{ t('overview.mixedPaymentAmounts') }}
          </div>
          <div v-else-if="paymentAmounts.length === 1" class="mt-2 text-sm text-slate-500">
            {{ t('overview.paymentAmountEach', { amount: formatCurrency(paymentAmounts[0]?.amount ?? 0) }) }}
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.donations') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.donationCount') }}</span>
            <span>{{ data.donations.count }}</span>
          </div>

          <div class="flex justify-between font-bold text-orange-600">
            <span>{{ t('overview.donationTotal') }}</span>
            <span>{{ formatCurrency(data.donations.total) }}</span>
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-2">{{ t('overview.totalIncome') }}</h2>
          <div class="text-3xl font-bold text-orange-600">
            {{ formatCurrency(data.regular.totalRevenue + data.payments.revenue + data.donations.total) }}
          </div>
          <div class="mt-1 text-sm text-slate-500">
            {{ t('overview.totalIncomeBreakdown', {
              sales: formatCurrency(data.regular.totalRevenue),
              payments: formatCurrency(data.payments.revenue),
              donations: formatCurrency(data.donations.total)
            }) }}
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.lastHour') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.revenue') }}</span>
            <span>
              {{ formatCurrency(data.lastHour.revenue) }}
              <span
                :class="data.lastHour.diffRevenue >= 0 ? 'text-green-600' : 'text-red-600'"
              >
                ({{ formatCurrency(data.lastHour.diffRevenue, { signDisplay: 'exceptZero' }) }})
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

          <div v-if="hourlyBars.length === 0" class="text-gray-400">
            {{ t('overview.noHourlySales') }}
          </div>

          <div v-else class="overflow-x-auto pb-1 hourly-chart-scroll">
            <div class="flex items-end gap-2 min-w-fit">
              <div
                v-for="entry in hourlyBars"
                :key="entry.hour"
                class="flex flex-col items-center flex-1 min-w-14"
                :title="`${entry.revenueLabel} — ${entry.quantity} ${t('overview.pcs')}`"
              >
                <span class="text-xs text-slate-600 mb-1 whitespace-nowrap">{{ entry.revenueLabel }}</span>
                <div
                  class="w-full rounded-t-md bg-orange-500"
                  :style="{ height: `${entry.height}px` }"
                ></div>
                <span class="text-xs text-slate-500 mt-1 whitespace-nowrap border-t border-slate-300 w-full text-center pt-1">
                  {{ entry.hourLabel }}
                </span>
                <span class="text-xs text-slate-400 whitespace-nowrap h-4">
                  {{ entry.dayLabel }}
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
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'

const { selectedEvent } = useCheckout()
const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()
const { onRefresh } = useAppRefresh()

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const data = ref<any | null>(null)
const loading = ref(true)

const MAX_BAR_HEIGHT = 160

const hourly = computed<any[]>(() => data.value?.hourly ?? [])
const paymentAmounts = computed<Array<{ amount: number, count: number }>>(() => data.value?.payments?.amounts ?? [])
const maxHourlyRevenue = computed(() => hourly.value.reduce((max: number, entry: any) => Math.max(max, Number(entry.revenue)), 0))

function toBerlinIso(hour: string) {
  return new Date(hour.replace(' ', 'T') + 'Z').toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })
}

// Everything a bar needs (labels, formatted currency, height) is derived here
// once per `hourly` change instead of via plain functions called from the
// template — those re-run on every render and each re-parse the date and
// re-instantiate an Intl formatter, which got noticeably slow once an event
// had many hourly buckets.
const hourlyBars = computed(() => {
  const max = maxHourlyRevenue.value
  let previousDate = ''

  return hourly.value.map((entry: any) => {
    const revenue = Number(entry.revenue)
    const berlinIso = toBerlinIso(entry.hour)
    const berlinDate = berlinIso.slice(0, 10)
    const dayLabel = berlinDate === previousDate ? '' : `${berlinDate.slice(8, 10)}.${berlinDate.slice(5, 7)}.`
    previousDate = berlinDate

    const scaled = Math.round((max > 0 ? revenue / max : 0) * MAX_BAR_HEIGHT)
    const height = max <= 0 ? 2 : Math.max(revenue > 0 ? 4 : 2, scaled)

    return {
      hour: entry.hour,
      revenue,
      quantity: entry.quantity,
      revenueLabel: formatCurrency(revenue),
      hourLabel: berlinIso.slice(11, 16),
      dayLabel,
      height,
    }
  })
})

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

<style scoped>
/* main.css hides scrollbars globally; re-enable one here so it's obvious the
   chart scrolls once an event has more hourly bars than fit on screen. */
.hourly-chart-scroll {
  scrollbar-width: thin;
  scrollbar-color: #94a3b8 #f1f5f9; /* slate-400 / slate-100 */
}

.hourly-chart-scroll::-webkit-scrollbar {
  display: block;
  height: 10px;
}

/* Chrome clips the scrollbar's hit-rectangle to hard square edges no matter
   what border-radius says — the radius only shows where the painted
   background is inset from that edge. The thumb gets that inset for free
   (it floats shorter than the full track); the track needs it forced via a
   transparent border + padding-box clip, or its rounded ends get clipped away. */
.hourly-chart-scroll::-webkit-scrollbar-track,
.hourly-chart-scroll::-webkit-scrollbar-track-piece {
  background-color: #f1f5f9; /* slate-100 */
  border: 1px solid transparent;
  background-clip: padding-box;
  border-radius: 9999px;
}

.hourly-chart-scroll::-webkit-scrollbar-thumb {
  background-color: #94a3b8; /* slate-400 */
  border-radius: 9999px;
}
</style>
