<template>
  <Page :headline1="t('overview.title')" @open-menu="$emit('openMenu')">
    <template #header>
      <div class="ml-auto flex flex-col gap-2 md:flex-row md:gap-4">
        <MenuSelectEvent />
        <div v-if="showStandFilter" class="w-40 md:w-52">
          <CommonSearchSelect
            v-model="standQuery"
            :options="standOptions"
            :placeholder="t('overview.standFilter')"
            :empty-text="t('select.noStands')"
            :selected-label="selectedStandLabel"
            @select="onStandSelect"
            @clear-selection="overviewStand = 'all'"
          />
        </div>
      </div>
    </template>

    <template #cards>
      <div v-if="!selectedEvent" class="col-span-12 text-base-500">
        {{ t('overview.selectEvent') }}
      </div>

      <template v-else-if="data">
        <CommonOfflineNotice v-if="stale" :cached-at="cachedAt" />

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.regularSales') }}</h2>

          <ul>
            <li
              v-for="i in data.regular.items"
              :key="i.id"
              class="grid grid-cols-[minmax(0,1fr)_auto_5rem] gap-4 border-b border-base-200 py-1"
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
              class="grid grid-cols-[minmax(0,1fr)_auto_5rem] gap-4 border-b border-base-200 py-1"
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

        <div v-if="!standFilterActive" class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.fachschaftPayments') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.paidMembers') }}</span>
            <span>{{ data.payments.count }}</span>
          </div>

          <div class="flex justify-between font-bold">
            <span>{{ t('overview.revenue') }}</span>
            <span>{{ formatCurrency(Number(data.payments.revenue)) }}</span>
          </div>

          <div v-if="paymentAmounts.length > 1" class="mt-2 text-sm text-base-500">
            {{ t('overview.mixedPaymentAmounts') }}
          </div>
          <div v-else-if="paymentAmounts.length === 1" class="mt-2 text-sm text-base-500">
            {{ t('overview.paymentAmountEach', { amount: formatCurrency(paymentAmounts[0]?.amount ?? 0) }) }}
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.donations') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.donationCount') }}</span>
            <span>{{ data.donations.count }}</span>
          </div>

          <div class="flex justify-between font-bold text-accent-600">
            <span>{{ t('overview.donationTotal') }}</span>
            <span>{{ formatCurrency(data.donations.total) }}</span>
          </div>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <template v-if="standFilterActive">
            <h2 class="text-lg font-semibold mb-2">{{ t('overview.totalIncomeStand') }}</h2>
            <div class="text-3xl font-bold text-accent-600">
              {{ formatCurrency(data.regular.totalRevenue + data.donations.total) }}
            </div>
            <div class="mt-1 text-sm text-base-500">
              {{ t('overview.totalIncomeStandBreakdown', {
                sales: formatCurrency(data.regular.totalRevenue),
                donations: formatCurrency(data.donations.total)
              }) }}
            </div>
          </template>

          <template v-else>
            <h2 class="text-lg font-semibold mb-2">{{ t('overview.totalIncome') }}</h2>
            <div class="text-3xl font-bold text-accent-600">
              {{ formatCurrency(data.regular.totalRevenue + data.payments.revenue + data.donations.total) }}
            </div>
            <div class="mt-1 text-sm text-base-500">
              {{ t('overview.totalIncomeBreakdown', {
                sales: formatCurrency(data.regular.totalRevenue),
                payments: formatCurrency(data.payments.revenue),
                donations: formatCurrency(data.donations.total)
              }) }}
            </div>
          </template>
        </div>

        <div class="col-span-12 xl:col-span-6 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.lastHour') }}</h2>

          <div class="flex justify-between">
            <span>{{ t('overview.revenue') }}</span>
            <span>
              {{ formatCurrency(data.lastHour.revenue) }}
              <span
                :class="data.lastHour.diffRevenue >= 0 ? 'text-success-600' : 'text-danger-600'"
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
                :class="data.lastHour.diffQuantity >= 0 ? 'text-success-600' : 'text-danger-600'"
              >
                ({{ data.lastHour.diffQuantity >= 0 ? '+' : '' }}{{ data.lastHour.diffQuantity }})
              </span>
            </span>
          </div>
        </div>

        <div v-if="showStandFilter" class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.standComparison') }}</h2>

          <div class="hidden md:grid grid-cols-[minmax(0,1fr)_6rem_6rem_7rem_7rem] gap-4 text-xs text-base-500 pb-1 border-b border-base-200">
            <span>{{ t('overview.standFilter') }}</span>
            <span class="text-right">{{ t('overview.orders') }}</span>
            <span class="text-right">{{ t('overview.itemsSold') }}</span>
            <span class="text-right">{{ t('overview.revenue') }}</span>
            <span class="text-right">{{ t('overview.donations') }}</span>
          </div>

          <ul>
            <li v-for="row in standRows" :key="row.key">
              <button
                type="button"
                class="w-full text-left px-1 py-2 border-b border-base-200 cursor-pointer transition-colors hover:bg-base-50"
                :class="row.filterValue === overviewStand ? 'bg-base-100' : ''"
                @click="overviewStand = row.filterValue"
              >
                <div class="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_6rem_6rem_7rem_7rem] gap-x-4 gap-y-1 text-sm">
                  <span class="col-span-2 md:col-span-1 truncate font-semibold">{{ row.label }}</span>
                  <span class="md:text-right">
                    <span class="md:hidden text-base-500">{{ t('overview.orders') }}: </span>{{ row.orders }}
                  </span>
                  <span class="text-right">
                    <span class="md:hidden text-base-500">{{ t('overview.itemsSold') }}: </span>{{ row.quantity }} {{ t('overview.pcs') }}
                  </span>
                  <span class="md:text-right">
                    <span class="md:hidden text-base-500">{{ t('overview.revenue') }}: </span>{{ row.revenueLabel }}
                  </span>
                  <span class="text-right text-accent-600">
                    <span class="md:hidden text-base-500">{{ t('overview.donations') }}: </span>{{ row.donationsLabel }}
                  </span>
                </div>
                <div class="mt-1 h-2 rounded-full bg-base-100">
                  <div class="h-2 rounded-full bg-accent-500" :style="{ width: `${row.barPercent}%` }"></div>
                </div>
              </button>
            </li>
          </ul>
        </div>

        <div class="col-span-12 bg-white p-4 rounded-xl shadow-lg">
          <h2 class="text-lg font-semibold mb-4">{{ t('overview.hourlySales') }}</h2>

          <div v-if="hourlyBars.length === 0" class="text-base-400">
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
                <span class="text-xs text-base-600 mb-1 whitespace-nowrap">{{ entry.revenueLabel }}</span>
                <div
                  class="w-full rounded-t-md bg-accent-500"
                  :style="{ height: `${entry.height}px` }"
                ></div>
                <span class="text-xs text-base-500 mt-1 whitespace-nowrap border-t border-base-300 w-full text-center pt-1">
                  {{ entry.hourLabel }}
                </span>
                <span class="text-xs text-base-400 whitespace-nowrap h-4">
                  {{ entry.dayLabel }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <CommonOfflineNotice v-else-if="stale" variant="noData" />

      <div v-else-if="loading" class="col-span-12 text-base-500">
        {{ t('common.loading') }}
      </div>
    </template>
  </Page>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useAppRefresh } from '~/composables/useAppRefresh'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { cachedFetch } from '~/composables/useCachedFetch'
import { onOfflineDataChanged } from '~/composables/useOfflineQueue'
import { usePersistedState } from '~/composables/usePersistedState'
import type { SearchSelectOption } from '~/components/Common/SearchSelect.vue'

const { selectedEvent } = useCheckout()
const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()
const { onRefresh } = useAppRefresh()

const emit = defineEmits<{
  (e: 'openMenu'): void
}>()

const data = ref<any | null>(null)
const loading = ref(true)
const stale = ref(false)
const cachedAt = ref<number | null>(null)

const MAX_BAR_HEIGHT = 160

type OverviewStandFilter = 'all' | 'none' | number

// Local to the overview: whoever reads the stats is not standing at a stand,
// so this is deliberately separate from the checkout's selectedStand.
const overviewStand = usePersistedState<OverviewStandFilter>('overviewStand', () => 'all', (stored) => {
  if (stored === 'all' || stored === 'none') return stored
  return Number(stored) > 0 ? Number(stored) : undefined
})
const standQuery = ref('')

interface StandStat {
  id: number | null
  name: string | null
  orders: number
  quantity: number
  revenue: number
  donations: number
}

// Always covers the whole event, independent of the filter.
const standStats = computed<StandStat[]>(() => data.value?.stands ?? [])
// Events without stand sales show no stand UI, like the checkout without active stands.
const showStandFilter = computed(() => standStats.value.some(stand => stand.id != null))
const standFilterActive = computed(() => showStandFilter.value && overviewStand.value !== 'all')

function standLabel(stand: StandStat) {
  if (stand.id == null) return t('overview.noStand')
  return stand.name ?? `#${stand.id}`
}

function standFilterValue(stand: StandStat): OverviewStandFilter {
  return stand.id == null ? 'none' : stand.id
}

const standOptions = computed<SearchSelectOption[]>(() => [
  { key: 'all', label: t('overview.allStands'), value: 'all' },
  ...standStats.value.map(stand => ({
    key: String(standFilterValue(stand)),
    label: standLabel(stand),
    value: standFilterValue(stand),
  })),
])

const selectedStandLabel = computed(() =>
  standOptions.value.find(option => option.value === overviewStand.value)?.label ?? '')

function onStandSelect(value: unknown) {
  overviewStand.value = value as OverviewStandFilter
  standQuery.value = ''
}

const standRows = computed(() => {
  const max = standStats.value.reduce((highest, stand) => Math.max(highest, Number(stand.revenue)), 0)

  return standStats.value.map((stand) => {
    const revenue = Number(stand.revenue)
    return {
      key: String(standFilterValue(stand)),
      filterValue: standFilterValue(stand),
      label: standLabel(stand),
      orders: Number(stand.orders),
      quantity: Number(stand.quantity),
      revenueLabel: formatCurrency(revenue),
      donationsLabel: formatCurrency(Number(stand.donations)),
      barPercent: max > 0 ? Math.max(revenue > 0 ? 1 : 0, revenue / max * 100) : 0,
    }
  })
})

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
  try {
    const standId = encodeURIComponent(String(overviewStand.value))
    const result = await cachedFetch<any>(`/api/overview?eventId=${selectedEvent.value}&standId=${standId}`)
    stale.value = result.stale
    cachedAt.value = result.cachedAt
    if (result.data.ok) {
      data.value = result.data
      if (overviewStand.value !== 'all' && (!showStandFilter.value
        || !standOptions.value.some(option => option.value === overviewStand.value))) {
        overviewStand.value = 'all'
      }
    }
  } catch {
    data.value = null
    stale.value = true
    cachedAt.value = null
  } finally {
    loading.value = false
  }
}

watch([selectedEvent, overviewStand], () => {
  loadOverview()
})

onMounted(loadOverview)
onRefresh(loadOverview)
onOfflineDataChanged(loadOverview)
</script>

<style scoped>
/* main.css hides scrollbars globally; re-enable one here so it's obvious the
   chart scrolls once an event has more hourly bars than fit on screen. */
.hourly-chart-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-base-400) var(--color-base-100);
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
  background-color: var(--color-base-100);
  border: 1px solid transparent;
  background-clip: padding-box;
  border-radius: 9999px;
}

.hourly-chart-scroll::-webkit-scrollbar-thumb {
  background-color: var(--color-base-400);
  border-radius: 9999px;
}
</style>
