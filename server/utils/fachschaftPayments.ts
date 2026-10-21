import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import type { ActorRef } from '~/server/utils/affiliations'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'
import { getCashRegisterSettings, isKnownFachschaftPaymentAmount } from '~/server/utils/appSettings'
import { validateEventAccess } from '~/server/utils/checkout'
import type { PaymentMethod } from '~/server/utils/checkoutBooking'

/** A validated Fachschaft payment, ready to be booked by bookFachschaftPayment. */
export interface FachschaftPaymentPlan {
  cashierId: number
  eventId: number
  memberId: number
  amount: number
}

export async function findCommittedFachschaftPayment(clientUuid: string) {
  const rows = await query<Array<{ id: number, amount: string | number }>>(
    `SELECT id, amount FROM fachschaft_payments WHERE client_uuid = ? LIMIT 1`,
    [clientUuid],
  )
  const row = rows[0]
  if (!row) return null

  return {
    ok: true as const,
    duplicate: true,
    payment_id: Number(row.id),
    order_id: Number(row.id),
    amount: Number(row.amount),
  }
}

/**
 * Validates a Fachschaft payment request (the FachschaftPayPayload) without
 * writing anything. A card payment runs this again on its stored payload when
 * SumUp reports success.
 */
export async function prepareFachschaftPayment(actor: ActorRef, body: any): Promise<{ ok: true, plan: FachschaftPaymentPlan } | { ok: false, error: string }> {
  const { cashier_id, event_id, member_id, amount } = body ?? {}

  if (!cashier_id || !event_id || !member_id) {
    return { ok: false, error: 'Missing payment details' }
  }

  const requestedAmount = amount == null ? null : Math.round(Number(amount) * 100) / 100
  if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
    return { ok: false, error: 'Missing payment details' }
  }

  const selectedCashier = await getCashRegisterCashierById(Number(cashier_id))
  if (!selectedCashier) {
    return { ok: false, error: 'Selected cashier does not exist' }
  }
  if (!selectedCashier.is_active) {
    return { ok: false, error: 'Selected cashier is not active' }
  }

  const selectedMember = await getCashRegisterCashierById(Number(member_id))
  if (!selectedMember) {
    return { ok: false, error: 'Selected member does not exist' }
  }
  if (!selectedMember.is_active) {
    return { ok: false, error: 'Selected member is not active' }
  }

  const selectedEvent = await getCashRegisterEventById(Number(event_id))
  if (!selectedEvent) {
    return { ok: false, error: 'Selected event does not exist' }
  }
  if (!selectedEvent.is_active) {
    return { ok: false, error: 'Selected event is not active' }
  }

  const blocked = await validateEventAccess(actor, selectedCashier, selectedEvent.id)
  if (blocked) return blocked

  if (!selectedEvent.fachschaft_enabled) {
    return { ok: false, error: 'Fachschaft payments are disabled for this event' }
  }

  if (requestedAmount !== null && !(await isKnownFachschaftPaymentAmount(requestedAmount))) {
    return { ok: false, error: 'Payment amount does not match any known Fachschaft amount' }
  }

  const settings = await getCashRegisterSettings()
  if (!settings.fachschaft_enabled) {
    return { ok: false, error: 'Fachschaft payments are disabled' }
  }

  return {
    ok: true,
    plan: {
      cashierId: Number(cashier_id),
      eventId: selectedEvent.id,
      memberId: Number(member_id),
      amount: requestedAmount ?? settings.fachschaft_payment_amount,
    },
  }
}

export async function bookFachschaftPayment(
  plan: FachschaftPaymentPlan,
  options: { clientUuid: string | null, paymentMethod: PaymentMethod },
  conn?: mariadb.PoolConnection,
) {
  const result = await query(
    `INSERT INTO fachschaft_payments (member_id, cashier_id, event_id, amount, client_uuid, payment_method) VALUES (?, ?, ?, ?, ?, ?)`,
    [plan.memberId, plan.cashierId, plan.eventId, plan.amount.toFixed(2), options.clientUuid, options.paymentMethod],
    conn,
  )
  return Number(normalizeBigInt((result as any).insertId))
}
