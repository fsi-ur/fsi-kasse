import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { round2 } from '~/server/utils/checkout'
import { PROBLEM_SQL } from '~/server/utils/cardPayments'

export interface CardSettlementRow {
  /** A stand's card sales, or the card-paid Fachschaft payments */
  group: 'stand' | 'fachschaft'
  /** null on the Fachschaft row, or for a stand deleted since. */
  stand_id: number | null
  stand_name: string | null
  count: number
  /** What the terminals charged, tips included. */
  charged: number
  /** Card sales without donations and tips. */
  sales: number
  /** Donations and tips paid by card (they belong to the stand). */
  donations: number
  tips: number
  /** Fees SumUp reported. */
  fees_actual: number
  /** Estimated with the fee rate for payments whose fee is not known yet. */
  fees_estimated: number
  /** Payments without an actual fee — the row is provisional while this is > 0. */
  unknown_fee_count: number
  /** sales + donations − fees: what the stand is owed. */
  payout: number
}

/**
 * The card side of an event: one settlement row per stand plus one for the
 * Fachschaft payments (all card money lands in the till's own SumUp account and is paid
 * out per stand) and the payments that need an admin.
 * Values come from the booked card payments themselves — what the terminal
 * actually charged — not from order lines a change request may have edited.
 */
export async function loadCardOverview(eventId: number, feeRatePercent: number) {
  const rows = normalizeBigInt(await query<any[]>(
    `SELECT
       cp.kind = 'fachschaft_payment' AS is_fachschaft,
       IF(cp.kind = 'fachschaft_payment', NULL, cp.stand_id) AS stand_id,
       MAX(s.name) AS stand_name,
       COUNT(*) AS count,
       IFNULL(SUM(cp.charged_amount), 0) AS charged,
       IFNULL(SUM(d.amount), 0) AS donations,
       IFNULL(SUM(cp.tip_amount), 0) AS tips,
       IFNULL(SUM(cp.fee_amount), 0) AS fees_actual,
       IFNULL(SUM(IF(cp.fee_amount IS NULL, cp.charged_amount, 0)), 0) AS unknown_fee_base,
       SUM(cp.fee_amount IS NULL) AS unknown_fee_count
     FROM card_payments cp
     LEFT JOIN donations d ON d.client_uuid = cp.client_uuid AND cp.kind = 'checkout'
     LEFT JOIN stands s ON s.id = cp.stand_id AND cp.kind = 'checkout'
     WHERE cp.event_id = ? AND cp.status = 'booked'
     GROUP BY cp.kind = 'fachschaft_payment', IF(cp.kind = 'fachschaft_payment', NULL, cp.stand_id)`,
    [eventId],
  )) as any[]

  const settlement: CardSettlementRow[] = rows.map((row) => {
    const charged = Number(row.charged)
    const donations = Number(row.donations)
    const feesActual = Number(row.fees_actual)
    const feesEstimated = round2(Number(row.unknown_fee_base) * feeRatePercent / 100)
    return {
      group: Number(row.is_fachschaft) ? 'fachschaft' : 'stand',
      stand_id: row.stand_id == null ? null : Number(row.stand_id),
      stand_name: row.stand_name ?? null,
      count: Number(row.count),
      charged,
      sales: round2(charged - donations),
      donations,
      tips: Number(row.tips),
      fees_actual: feesActual,
      fees_estimated: feesEstimated,
      unknown_fee_count: Number(row.unknown_fee_count ?? 0),
      payout: round2(charged - feesActual - feesEstimated),
    }
  })

  // Stands by name, a deleted stand after them, the Fachschaft payments last.
  const rank = (row: CardSettlementRow) => row.group === 'fachschaft' ? 2 : row.stand_name == null ? 1 : 0
  settlement.sort((a, b) => rank(a) - rank(b) || String(a.stand_name).localeCompare(String(b.stand_name), 'de'))

  const problemRows = await query<Array<{ count: unknown }>>(
    `SELECT COUNT(*) AS count FROM card_payments cp WHERE cp.event_id = ? AND ${PROBLEM_SQL}`,
    [eventId],
  )

  return {
    settlement,
    fee_rate: feeRatePercent,
    problem_count: Number(problemRows[0]?.count ?? 0),
    payment_count: settlement.reduce((sum, row) => sum + row.count, 0),
  }
}
