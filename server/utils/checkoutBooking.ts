import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import type { ActorRef } from '~/server/utils/affiliations'
import {
  bookedTotal,
  normalizeLines,
  resolveBookedLines,
  round2,
  validateCashierAndEvent,
  type BookedLine,
} from '~/server/utils/checkout'
import { resolveStandId } from '~/server/utils/stands'
import { normalizeDepositReturns, resolveDepositReturns } from '~/server/utils/deposits'
import { getCashRegisterEventById } from '~/server/utils/events'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import {
  applyVoucherDeltas,
  normalizeVoucherSales,
  resolveVoucherLines,
  type VoucherDelta,
} from '~/server/utils/vouchers'

export type PaymentMethod = 'cash' | 'card'

type DonationInput =
  | null
  | { mode: 'direct', amount: number }
  | { mode: 'paid', paid_amount: number }

function parseDonation(value: unknown): DonationInput | undefined {
  if (value == null) return null
  const donation = value as Record<string, unknown>

  if (donation.mode === 'direct') {
    const amount = Number(donation.amount)
    if (!Number.isFinite(amount) || amount <= 0) return undefined
    return { mode: 'direct', amount }
  }

  if (donation.mode === 'paid') {
    const paidAmount = Number(donation.paid_amount)
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return undefined
    return { mode: 'paid', paid_amount: paidAmount }
  }

  return undefined
}

/** A validated checkout, ready to be booked by bookCheckout. */
export interface CheckoutPlan {
  cashierId: number
  eventId: number
  standId: number | null
  isFachschaft: boolean
  booked: BookedLine[]
  voucherDeltas: Map<number, VoucherDelta>
  /** The cash due for the lines (0 for a Fachschaft order, negative for a payout). */
  total: number
  donationAmount: number
}

/**
 * Validates a checkout request (the CheckoutPayload) without writing anything:
 * cashier/event access, lines at known prices, deposit returns, voucher lines,
 * Fachschaft rules, total and donation. Voucher state (units, validity) is
 * only checked under lock by bookCheckout. A card payment runs this again on
 * its stored payload when SumUp reports success.
 */
export async function prepareCheckout(actor: ActorRef, body: any): Promise<{ ok: true, plan: CheckoutPlan } | { ok: false, error: string }> {
  const cashierId = Number(body?.cashier_id)
  const eventId = Number(body?.event_id)
  if (!cashierId || !eventId) {
    return { ok: false, error: 'Missing order details' }
  }

  const lines = normalizeLines(body?.items)
  if (!lines) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const voucherSales = normalizeVoucherSales(body?.voucher_sales)
  if (!voucherSales) {
    return { ok: false, error: 'Missing or invalid voucher sales' }
  }

  const depositReturns = normalizeDepositReturns(body?.deposit_returns)
  if (!depositReturns) {
    return { ok: false, error: 'Missing or invalid deposit returns' }
  }

  const donation = parseDonation(body?.donation)
  if (donation === undefined) {
    return { ok: false, error: 'Missing or invalid donation details' }
  }

  if (lines.length === 0 && voucherSales.length === 0 && depositReturns.length === 0 && !donation) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const invalid = await validateCashierAndEvent(actor, cashierId, eventId)
  if (invalid) return invalid

  const standId = await resolveStandId(body?.stand_id)

  const resolved = await resolveBookedLines(lines)
  if (!resolved.ok) return resolved

  const returns = await resolveDepositReturns(depositReturns)
  if (!returns.ok) return returns

  const hasLines = resolved.booked.length > 0 || voucherSales.length > 0 || returns.booked.length > 0
  const isFachschaft = Boolean(body?.is_fachschaft) && hasLines
  // A Fachschaft order is free, so a deposit paid back in it would vanish from the total.
  if (isFachschaft && returns.booked.length > 0) {
    return { ok: false, error: 'Pfandrückgaben sind in Fachschaftsbestellungen nicht erlaubt' }
  }

  const vouchers = await resolveVoucherLines({ lines: resolved.booked, sales: voucherSales, isFachschaft })
  if (!vouchers.ok) return vouchers
  const booked = [...resolved.booked, ...vouchers.sales, ...returns.booked]

  if (isFachschaft) {
    const fachschaftEvent = await getCashRegisterEventById(eventId)
    if (!fachschaftEvent?.fachschaft_enabled || !(await getCashRegisterSettings()).fachschaft_enabled) {
      return { ok: false, error: 'Fachschaft orders are disabled' }
    }
  }
  const total = bookedTotal(booked, isFachschaft)

  const donationAmount = !donation
    ? 0
    : donation.mode === 'direct'
      ? round2(donation.amount)
      : Math.max(0, round2(donation.paid_amount - total))

  if (booked.length === 0 && donationAmount <= 0) {
    return { ok: false, error: 'Missing or invalid donation details' }
  }

  return {
    ok: true,
    plan: { cashierId, eventId, standId, isFachschaft, booked, voucherDeltas: vouchers.deltas, total, donationAmount },
  }
}

export interface BookCheckoutOptions {
  clientUuid: string
  paymentMethod: PaymentMethod
  /** A terminal tip: added to the order's donation (creating one if there is none). */
  extraDonation?: number
  /** Berlin wall clock voucher validity is judged at — now for cash, the start of a card payment. */
  at: string
}

/**
 * Writes a prepared checkout: the order with its lines, the voucher deltas
 * (under lock — throws VoucherBookingError, rolling back the caller's
 * transaction) and the donation. Must run inside a transaction.
 */
export async function bookCheckout(plan: CheckoutPlan, options: BookCheckoutOptions, conn: mariadb.PoolConnection) {
  let orderId: number | null = null

  if (plan.booked.length > 0) {
    const result = await query(
      `INSERT INTO orders (cashier_id, event_id, stand_id, fachschaft, client_uuid, payment_method) VALUES (?, ?, ?, ?, ?, ?)`,
      [plan.cashierId, plan.eventId, plan.standId, plan.isFachschaft ? 1 : 0, options.clientUuid, options.paymentMethod],
      conn,
    )

    orderId = Number(normalizeBigInt((result as any).insertId))

    // Validity is judged by the server's clock and the order's event.
    await applyVoucherDeltas(plan.voucherDeltas, { eventId: plan.eventId, at: options.at }, conn, orderId)

    for (const line of plan.booked) {
      await query(
        `INSERT INTO order_items
           (order_id, item_id, item_name, quantity, unit_price, unit_deposit, line_kind, voucher_id, voucher_covers_deposit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, line.item_id, line.name, line.quantity, line.unit_price, line.unit_deposit,
          line.line_kind, line.voucher_id, line.voucher_covers_deposit ? 1 : 0],
        conn,
      )
    }
  }

  const donationAmount = round2(plan.donationAmount + (options.extraDonation ?? 0))
  if (donationAmount > 0) {
    await query(
      `INSERT INTO donations (event_id, cashier_id, stand_id, amount, order_id, client_uuid, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [plan.eventId, plan.cashierId, plan.standId, donationAmount.toFixed(2), orderId, options.clientUuid, options.paymentMethod],
      conn,
    )
  }

  return { orderId, donationAmount }
}

/** A client_uuid that a card payment owns must never be booked as cash. */
export async function isCardPaymentUuid(clientUuid: string) {
  const rows = await query<Array<{ id: unknown }>>(`SELECT id FROM card_payments WHERE client_uuid = ? LIMIT 1`, [clientUuid])
  return rows.length > 0
}
