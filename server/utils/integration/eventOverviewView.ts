import { translate, type Language } from '~/shared/i18n'
import type { EventOverview } from '~/server/utils/overview'
import type {
  IntegrationEventTotals,
  ViewBlock,
  ViewFilter,
  ViewSection,
  ViewStatTile,
  ViewTableRow,
  ViewValue,
} from '~/server/utils/integration/viewContract'

// Turns the event overview into the generic view the Buchhaltung renders
// (see viewContract.ts). Mirrors components/pages/Overview.vue: what is shown
// and when is decided here, so changing the accounting app's overview means
// changing this file only.

interface BuildInput {
  language: Language
  overview: EventOverview
  /** The applied stand filter: 'all', 'none' or a stand id. */
  standValue: string
  showFachschaft: boolean
  showCard: boolean
}

const money = (value: number, extra: Partial<ViewValue> = {}): ViewValue => ({ value, format: 'currency', ...extra })
const count = (value: number, extra: Partial<ViewValue> = {}): ViewValue => ({ value, format: 'number', ...extra })
const deltaTone = (value: number) => value >= 0 ? 'success' as const : 'danger' as const

export function buildEventOverviewTotals(overview: EventOverview): IntegrationEventTotals {
  const orderRevenue = overview.regular.totalRevenue
  const donations = overview.donations.total
  const fachschaftPayments = overview.payments.revenue

  return {
    orderRevenue,
    orderRevenueCash: overview.regular.cashRevenue,
    orderRevenueCard: overview.regular.cardRevenue,
    depositNet: overview.regular.depositRevenue,
    donations,
    fachschaftPayments,
    fachschaftPaymentCount: overview.payments.count,
    fachschaftGivenOutWorth: overview.fachschaft.totalWorth,
    totalIncome: orderRevenue + donations + fachschaftPayments,
  }
}

/** Every stand filter value the overview offers, the first one meaning "no filter". */
export function standFilterValues(overview: EventOverview) {
  return ['all', ...overview.stands.map(stand => stand.id == null ? 'none' : String(stand.id))]
}

export function buildEventOverviewView(input: BuildInput): { filters: ViewFilter[], sections: ViewSection[] } {
  const { overview: data, standValue, showFachschaft, showCard } = input
  const t = (path: string, params?: Record<string, string | number>) => translate(input.language, path, params)
  const currencyFormat = new Intl.NumberFormat(input.language === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency: 'EUR' })
  const formatMoney = (value: number) => currencyFormat.format(value)

  const showStandFilter = data.stands.some(stand => stand.id != null)
  const standFilterActive = showStandFilter && standValue !== 'all'
  const standLabel = (stand: EventOverview['stands'][number]) =>
    stand.id == null ? t('overview.noStand') : (stand.name ?? `#${stand.id}`)
  const standFilterValue = (stand: EventOverview['stands'][number]) => stand.id == null ? 'none' : String(stand.id)

  const regularItems = data.regular.items as Array<{ id: number | null, name: string, quantity: unknown, revenue: unknown }>
  const fachschaftItems = data.fachschaft.items as Array<{ id: number | null, name: string, quantity: unknown, worth: unknown }>
  const regularQuantity = regularItems.reduce((sum, item) => sum + Number(item.quantity), 0)
  const fachschaftQuantity = fachschaftItems.reduce((sum, item) => sum + Number(item.quantity), 0)

  const deposits = data.deposits
  const showDeposits = deposits.amounts.length > 0
  const vouchers = data.vouchers
  const showVouchers = vouchers.sold.count > 0 || vouchers.redeemed.totalQuantity > 0 || vouchers.outstanding.length > 0
  const incomeSales = data.regular.salesRevenue
  const incomeDeposits = data.regular.depositRevenue

  const filters: ViewFilter[] = showStandFilter
    ? [{
        key: 'standId',
        label: t('overview.standFilter'),
        value: standFilterActive ? standValue : 'all',
        options: [
          { value: 'all', label: t('overview.allStands') },
          ...data.stands.map(stand => ({ value: standFilterValue(stand), label: standLabel(stand) })),
        ],
        activeNote: showFachschaft ? t('overview.paymentsNotStandBound') : undefined,
      }]
    : []

  const sections: ViewSection[] = []

  // Stat tiles
  const tiles: ViewStatTile[] = [{
    label: t('overview.revenue'),
    value: money(data.regular.totalRevenue),
    meta: t('overview.itemsSoldMeta', { count: regularQuantity }),
    icon: 'material-symbols:euro-rounded',
  }]
  if (showFachschaft && !standFilterActive) {
    const amounts = data.payments.amounts
    tiles.push({
      label: t('overview.fachschaftPayments'),
      value: money(data.payments.revenue),
      meta: amounts.length > 1
        ? `${t('overview.paymentsMeta', { count: data.payments.count })} · ${t('overview.mixedPaymentAmounts')}`
        : amounts.length === 1
          ? `${t('overview.paymentsMeta', { count: data.payments.count })} ${t('overview.paymentAmountEach', { amount: formatMoney(amounts[0]!.amount) })}`
          : t('overview.paymentsMeta', { count: data.payments.count }),
      icon: 'material-symbols:savings-rounded',
    })
  }
  tiles.push({
    label: t('overview.donations'),
    value: money(data.donations.total),
    meta: t('overview.donationsMeta', { count: data.donations.count }),
    icon: 'material-symbols:favorite-rounded',
  })
  if (showFachschaft) {
    tiles.push({
      label: t('overview.givenOutWorth'),
      value: money(data.fachschaft.totalWorth),
      meta: t('overview.givenOutMeta', { count: fachschaftQuantity }),
      icon: 'material-symbols:volunteer-activism-rounded',
    })
  }
  if (standFilterActive || !showFachschaft) {
    tiles.push({
      label: t(standFilterActive ? 'overview.totalIncomeStand' : 'overview.totalIncome'),
      value: money(data.regular.totalRevenue + data.donations.total),
      meta: t(showDeposits ? 'overview.totalIncomeStandBreakdownDeposits' : 'overview.totalIncomeStandBreakdown', {
        sales: formatMoney(incomeSales),
        deposits: formatMoney(incomeDeposits),
        donations: formatMoney(data.donations.total),
      }),
      icon: 'material-symbols:account-balance-wallet',
      tone: 'accent',
    })
  } else {
    tiles.push({
      label: t('overview.totalIncome'),
      value: money(data.regular.totalRevenue + data.payments.revenue + data.donations.total),
      meta: t(showDeposits ? 'overview.totalIncomeBreakdownDeposits' : 'overview.totalIncomeBreakdown', {
        sales: formatMoney(incomeSales),
        deposits: formatMoney(incomeDeposits),
        payments: formatMoney(data.payments.revenue),
        donations: formatMoney(data.donations.total),
      }),
      icon: 'material-symbols:account-balance-wallet',
      tone: 'accent',
    })
  }
  sections.push({ type: 'stats', id: 'stats', items: tiles })

  if (data.card.problem_count > 0) {
    sections.push({
      type: 'alert',
      id: 'cardProblems',
      tone: 'danger',
      icon: 'material-symbols:warning-outline-rounded',
      text: `${t('overview.card.problems', { count: data.card.problem_count })} ${t('overview.card.problemsHint')}`,
    })
  }

  // Stands in comparison — always the whole event, a row sets the filter.
  if (showStandFilter) {
    const max = data.stands.reduce((highest, stand) => Math.max(highest, stand.revenue), 0)
    sections.push({
      type: 'card',
      id: 'stands',
      title: t('overview.standComparison'),
      icon: 'material-symbols:storefront-rounded',
      blocks: [{
        type: 'table',
        columns: [
          { label: t('overview.standFilter') },
          { label: t('overview.orders'), align: 'right' },
          { label: t('overview.itemsSold'), align: 'right' },
          { label: t('overview.revenue'), align: 'right' },
          { label: t('overview.donations'), align: 'right' },
        ],
        rows: data.stands.map((stand): ViewTableRow => ({
          key: standFilterValue(stand),
          cells: [
            standLabel(stand),
            count(stand.orders),
            count(stand.quantity, { suffix: t('overview.pcs') }),
            money(stand.revenue),
            money(stand.donations, { tone: 'accent' }),
          ],
          bar: max > 0 ? Math.max(stand.revenue > 0 ? 1 : 0, stand.revenue / max * 100) : 0,
          note: showCard
            ? t('overview.card.standSplit', { card: formatMoney(stand.revenueCard), cash: formatMoney(stand.expectedCash) })
            : undefined,
          filter: { key: 'standId', value: standFilterValue(stand) },
          selected: standFilterActive && standFilterValue(stand) === standValue,
        })),
      }],
    })
  }

  sections.push({
    type: 'card',
    id: 'hourly',
    title: t('overview.hourlySales'),
    icon: 'material-symbols:bar-chart-rounded',
    blocks: [{
      type: 'hourlyChart',
      valueFormat: 'currency',
      points: data.hourly.map(entry => ({
        hour: `${entry.hour.replace(' ', 'T')}Z`,
        value: entry.revenue,
        caption: `${entry.quantity} ${t('overview.pcs')}`,
      })),
      empty: t('overview.noHourlySales'),
    }],
  })

  sections.push({
    type: 'card',
    id: 'sales',
    title: t('overview.regularSales'),
    icon: 'material-symbols:shopping-cart-rounded',
    width: 'half',
    blocks: [{
      type: 'table',
      columns: [
        { label: t('overview.item') },
        { label: t('overview.quantity'), align: 'right' },
        { label: t('overview.revenue'), align: 'right' },
      ],
      rows: regularItems.map(item => ({
        key: String(item.id ?? item.name),
        cells: [item.name, count(Number(item.quantity)), money(Number(item.revenue))],
      })),
      footer: [t('common.total'), count(regularQuantity), money(data.regular.itemsRevenue)],
      empty: t('overview.noHourlySales'),
      notes: [t('overview.historicalPricesNotice')],
    }],
  })

  if (showFachschaft) {
    sections.push({
      type: 'card',
      id: 'givenOut',
      title: t('overview.fachschaftGivenOut'),
      icon: 'material-symbols:volunteer-activism-rounded',
      width: 'half',
      blocks: [{
        type: 'table',
        columns: [
          { label: t('overview.item') },
          { label: t('overview.quantity'), align: 'right' },
          { label: t('overview.worth'), align: 'right' },
        ],
        rows: fachschaftItems.map(item => ({
          key: String(item.id ?? item.name),
          cells: [item.name, count(Number(item.quantity)), money(Number(item.worth))],
        })),
        footer: [t('common.total'), count(fachschaftQuantity), money(data.fachschaft.totalWorth)],
        empty: t('overview.noGivenOut'),
      }],
    })
  }

  if (showCard) {
    const cardItems: Extract<ViewBlock, { type: 'list' }>['items'] = [
      { label: t('overview.card.salesCash'), value: money(data.regular.cashRevenue) },
      { label: t('overview.card.salesCard'), value: money(data.regular.cardRevenue) },
      { label: t('overview.card.donationsCard'), value: money(data.donations.card) },
    ]
    if (data.expectedCash.payments !== null && showFachschaft) {
      cardItems.push({ label: t('overview.card.paymentsCard'), value: money(data.payments.card) })
    }
    sections.push({
      type: 'card',
      id: 'card',
      title: t('overview.card.title'),
      icon: 'material-symbols:credit-card-outline',
      width: 'half',
      blocks: [
        { type: 'list', items: cardItems },
        {
          type: 'metric',
          label: t(standFilterActive ? 'overview.card.expectedCashStand' : 'overview.card.expectedCash'),
          value: money(data.expectedCash.total),
          caption: data.expectedCash.payments === null
            ? t('overview.card.expectedCashStandBreakdown', {
                sales: formatMoney(data.expectedCash.orders),
                donations: formatMoney(data.expectedCash.donations),
              })
            : t('overview.card.expectedCashBreakdown', {
                sales: formatMoney(data.expectedCash.orders),
                donations: formatMoney(data.expectedCash.donations),
                payments: formatMoney(data.expectedCash.payments),
              }),
        },
      ],
    })
  }

  sections.push({
    type: 'card',
    id: 'lastHour',
    title: t('overview.lastHour'),
    icon: 'material-symbols:schedule-outline-rounded',
    width: 'half',
    blocks: [{
      type: 'list',
      items: [
        { label: t('overview.revenue'), value: money(data.lastHour.revenue) },
        { label: t('overview.revenueChange'), value: { value: data.lastHour.diffRevenue, format: 'signedCurrency', tone: deltaTone(data.lastHour.diffRevenue) }, style: 'indent' },
        { label: t('overview.itemsSold'), value: count(data.lastHour.quantity) },
        { label: t('overview.itemsSoldChange'), value: { value: data.lastHour.diffQuantity, format: 'signedNumber', tone: deltaTone(data.lastHour.diffQuantity) }, style: 'indent' },
      ],
    }],
  })

  if (showVouchers) {
    const blocks: ViewBlock[] = [{
      type: 'list',
      items: [
        { label: t('overview.vouchers.sold', { count: vouchers.sold.count }), value: money(vouchers.sold.revenue), style: 'strong' },
        { label: t('overview.vouchers.redeemed', { count: vouchers.redeemed.totalQuantity }), value: money(vouchers.redeemed.totalWorth) },
        ...(vouchers.redeemed.totalWorth > 0
          ? [{
              label: t('overview.vouchers.redeemedSplit'),
              value: `${formatMoney(vouchers.redeemed.paidWorth)} / ${formatMoney(vouchers.redeemed.freeWorth)}`,
              style: 'muted' as const,
            }]
          : []),
        { label: t('overview.vouchers.deposits'), value: money(vouchers.redeemed.depositsCollected) },
      ],
      notes: [t('overview.vouchers.worthHint')],
    }]
    if (vouchers.redeemed.items.length) {
      blocks.push({
        type: 'table',
        columns: [
          { label: t('overview.item') },
          { label: t('overview.quantity'), align: 'right' },
          { label: t('overview.worth'), align: 'right' },
        ],
        rows: vouchers.redeemed.items.map(item => ({
          key: String(item.id ?? item.name),
          cells: [item.name, count(item.quantity), money(item.worth)],
        })),
      })
    }
    if (!standFilterActive && vouchers.outstanding.length) {
      blocks.push({
        type: 'table',
        title: t('overview.vouchers.outstanding'),
        columns: [
          { label: t('overview.vouchers.batch') },
          { label: t('overview.vouchers.unitsColumn'), align: 'right' },
          { label: t('overview.vouchers.estimatedWorth'), align: 'right' },
        ],
        rows: vouchers.outstanding.map(batch => ({
          key: String(batch.batch_id),
          cells: [batch.name, t('overview.vouchers.units', { count: batch.units }), money(batch.estimated_worth, { prefix: '~' })],
        })),
        notes: [t('overview.vouchers.estimateHint')],
      })
    }
    sections.push({
      type: 'card',
      id: 'vouchers',
      title: t('overview.vouchers.title'),
      icon: 'material-symbols:confirmation-number-outline-rounded',
      columns: 2,
      blocks,
    })
  }

  if (showDeposits) {
    const depositItems: Extract<ViewBlock, { type: 'list' }>['items'] = [
      { label: t('overview.deposits.issuedValue'), value: money(deposits.issuedValue) },
    ]
    // Only worth splitting when vouchers covered part of it.
    if (deposits.coveredValue > 0) {
      depositItems.push(
        { label: t('overview.deposits.covered'), value: money(deposits.coveredValue), style: 'indent' },
        { label: t('overview.deposits.taken'), value: money(deposits.issuedValue - deposits.coveredValue), style: 'indent' },
      )
    }
    depositItems.push(
      { label: t('overview.deposits.paidBack'), value: money(-deposits.returnedValue) },
      { label: t('overview.deposits.netCash'), value: money(deposits.netCash), style: 'strong' },
      { label: t('overview.deposits.openValue'), value: money(deposits.openValue), style: 'strong', tone: 'info' },
    )
    const notes = [t(standFilterActive ? 'overview.deposits.standHint' : 'overview.deposits.hint')]
    if (deposits.returnRate !== null) notes.unshift(t('overview.deposits.returnRate', { rate: Math.round(deposits.returnRate * 100) }))

    sections.push({
      type: 'card',
      id: 'deposits',
      title: t('overview.deposits.title'),
      icon: 'material-symbols:recycling-rounded',
      tone: 'info',
      columns: 2,
      blocks: [
        {
          type: 'table',
          columns: [
            { label: t('overview.deposits.amount') },
            { label: t('overview.deposits.issued'), align: 'right' },
            { label: t('overview.deposits.returned'), align: 'right' },
            { label: t('overview.deposits.open'), align: 'right' },
          ],
          rows: deposits.amounts.map(row => ({
            key: String(row.amount),
            cells: [money(row.amount), count(row.issued), count(row.returned), count(row.issued - row.returned)],
          })),
        },
        { type: 'list', items: depositItems, notes },
      ],
    })
  }

  if (showCard && data.card.settlement.length) {
    const feeRate = String(data.card.fee_rate)
    sections.push({
      type: 'card',
      id: 'settlement',
      title: t('overview.settlement.title'),
      icon: 'material-symbols:payments-outline-rounded',
      blocks: [{
        type: 'table',
        columns: [
          { label: t('history.stand') },
          { label: t('overview.settlement.payments'), align: 'right' },
          { label: t('overview.settlement.sales'), align: 'right' },
          { label: t('overview.settlement.donations'), align: 'right' },
          { label: t('overview.settlement.fees'), align: 'right' },
          { label: t('overview.settlement.payout'), align: 'right' },
        ],
        rows: data.card.settlement.map((row): ViewTableRow => ({
          key: row.group === 'fachschaft' ? 'fachschaft' : `stand-${row.stand_id}`,
          cells: [
            row.group === 'fachschaft' ? t('overview.settlement.fachschaft') : (row.stand_name ?? t('history.noStand')),
            count(row.count),
            money(row.sales),
            money(row.donations),
            money(-(row.fees_actual + row.fees_estimated)),
            money(row.payout),
          ],
          badge: row.unknown_fee_count > 0 ? { label: t('overview.settlement.provisional'), tone: 'warning' } : undefined,
          note: row.unknown_fee_count > 0
            ? t('overview.settlement.estimatedFees', {
                count: row.unknown_fee_count,
                amount: formatMoney(row.fees_estimated),
                rate: input.language === 'de' ? feeRate.replace('.', ',') : feeRate,
              })
            : undefined,
        })),
        notes: [t('overview.settlement.hint')],
      }],
    })
  }

  return { filters, sections }
}

