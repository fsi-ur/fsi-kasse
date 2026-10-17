import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { lineCashTotal, round2, type BookedLine } from '~/server/utils/checkout'

/** Stored as item_name, for readers of the snapshot columns (CSV, accounting). */
export const DEPOSIT_RETURN_NAME = 'Pfandrückgabe'

export const MAX_DEPOSIT_RETURN_QUANTITY = 10000

export interface RequestedDepositReturn {
  /** The deposit paid back per container, positive. */
  amount: number
  quantity: number
}

function toCents(amount: unknown) {
  return Math.round(Number(amount ?? 0) * 100)
}

/**
 * `deposit_returns` of a request: positive amounts and integer quantities,
 * merged per amount. A missing list comes back empty, an invalid one as null.
 */
export function normalizeDepositReturns(value: unknown): RequestedDepositReturn[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null

  const merged = new Map<number, RequestedDepositReturn>()
  for (const entry of value) {
    const amount = Number((entry as any)?.amount)
    const quantity = Number((entry as any)?.quantity)
    if (!Number.isFinite(amount) || amount <= 0) return null
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_DEPOSIT_RETURN_QUANTITY) return null

    const cents = toCents(amount)
    const existing = merged.get(cents)
    if (existing) existing.quantity += quantity
    else merged.set(cents, { amount: cents / 100, quantity })
  }

  return [...merged.values()]
}

/** Every deposit an item has (or ever had), in cents — what a return may pay back. */
async function loadKnownDepositCents() {
  const rows = await query<Array<{ deposit: unknown }>>(
    `SELECT deposit FROM items WHERE deposit > 0
     UNION
     SELECT deposit FROM item_price_history WHERE deposit > 0`,
  )
  return new Set(rows.map(row => toCents(row.deposit)))
}

/**
 * Books the returns at the amount the cashier paid back, if some item ever
 * had that deposit — like item prices, never repriced, only rejected.
 */
export async function resolveDepositReturns(returns: RequestedDepositReturn[]) {
  if (!returns.length) return { ok: true as const, booked: [] as BookedLine[] }

  const known = await loadKnownDepositCents()
  for (const entry of returns) {
    if (!known.has(toCents(entry.amount))) {
      return { ok: false as const, error: 'Pfandbetrag passt zu keinem Artikel' }
    }
  }

  const booked: BookedLine[] = returns.map((entry) => {
    const line = {
      item_id: null,
      name: DEPOSIT_RETURN_NAME,
      quantity: entry.quantity,
      unit_price: 0,
      unit_deposit: -round2(entry.amount),
      line_kind: 'deposit_return' as const,
      voucher_id: null,
      voucher_code: null,
      voucher_covers_deposit: false,
    }
    return { ...line, line_total: lineCashTotal(line) }
  })

  return { ok: true as const, booked }
}

/** SQL fragment filtering `orders o` by stand, as built by the overview endpoint. */
interface StandFilter {
  orders: string
  params: unknown[]
}

export interface DepositAmountStat {
  amount: number
  /** Containers handed out with a deposit (sales and redemptions). */
  issued: number
  /** Of those, redemptions whose voucher covered the deposit (no cash taken). */
  covered: number
  returned: number
}

export interface DepositOverview {
  amounts: DepositAmountStat[]
  issuedValue: number
  coveredValue: number
  returnedValue: number
  /** Deposit cash in the till: taken minus paid back. */
  netCash: number
  /** Deposit on containers not returned (yet) — negative when more came back than went out. */
  openValue: number
  /** returned / issued, null without issued containers. */
  returnRate: number | null
}

export async function loadDepositOverview(eventId: number, stand: StandFilter): Promise<DepositOverview> {
  const rows: any[] = normalizeBigInt(await query(`
    SELECT
      ABS(oi.unit_deposit) AS amount,
      SUM(IF(oi.line_kind = 'deposit_return', 0, oi.quantity)) AS issued,
      SUM(IF(oi.line_kind = 'voucher_redemption' AND oi.voucher_covers_deposit = 1, oi.quantity, 0)) AS covered,
      SUM(IF(oi.line_kind = 'deposit_return', oi.quantity, 0)) AS returned
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.fachschaft = 0
      AND oi.unit_deposit <> 0
      AND oi.line_kind IN ('item', 'voucher_redemption', 'deposit_return')
      AND o.event_id = ?${stand.orders}
    GROUP BY ABS(oi.unit_deposit)
    ORDER BY amount ASC
  `, [eventId, ...stand.params]))

  return buildDepositOverview(rows)
}

export function buildDepositOverview(rows: Array<{ amount: unknown, issued: unknown, covered: unknown, returned: unknown }>): DepositOverview {
  const amounts = rows.map(row => ({
    amount: round2(Number(row.amount)),
    issued: Number(row.issued ?? 0),
    covered: Number(row.covered ?? 0),
    returned: Number(row.returned ?? 0),
  }))

  const sum = (pick: (entry: DepositAmountStat) => number) =>
    round2(amounts.reduce((total, entry) => total + pick(entry) * entry.amount, 0))
  const issuedValue = sum(entry => entry.issued)
  const coveredValue = sum(entry => entry.covered)
  const returnedValue = sum(entry => entry.returned)
  const issued = amounts.reduce((total, entry) => total + entry.issued, 0)
  const returned = amounts.reduce((total, entry) => total + entry.returned, 0)

  return {
    amounts,
    issuedValue,
    coveredValue,
    returnedValue,
    netCash: round2(issuedValue - coveredValue - returnedValue),
    openValue: round2(issuedValue - returnedValue),
    returnRate: issued > 0 ? returned / issued : null,
  }
}
