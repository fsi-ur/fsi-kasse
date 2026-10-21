import type * as mariadb from 'mariadb'
import { randomBytes } from 'node:crypto'
import { query, withTransaction } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getActorScope, type ActorRef } from '~/server/utils/affiliations'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import { findCommittedCheckout, normalizeClientUuid, round2 } from '~/server/utils/checkout'
import { bookCheckout, prepareCheckout, type CheckoutPlan } from '~/server/utils/checkoutBooking'
import { getCashRegisterEventById } from '~/server/utils/events'
import {
  bookFachschaftPayment,
  findCommittedFachschaftPayment,
  prepareFachschaftPayment,
  type FachschaftPaymentPlan,
} from '~/server/utils/fachschaftPayments'
import { CARD_NOT_CONFIGURED_ERROR, isCardConfigured, sumup, sumupConfig, type SumupTransaction } from '~/server/utils/sumup'
import { berlinLocalNow, VoucherBookingError } from '~/server/utils/vouchers'
import type { User } from '~/types/user'

/**
 * Card payments through SumUp Solo terminals. The booking invariant: a card
 * payment is booked ONLY by finalizeCardPayment, never by a client request.
 * The client starts a payment (which stores the validated payload) and then
 * only ever asks for its status; the order/donation/Fachschaft payment is
 * written when SumUp — re-fetched, never taken from a webhook body — reports
 * the transaction as successful.
 */

export type CardPaymentKind = 'checkout' | 'fachschaft_payment'
export type CardPaymentStatus = 'created' | 'processing' | 'successful' | 'failed' | 'booked' | 'booking_failed' | 'resolved'

const FINAL_STATUSES: CardPaymentStatus[] = ['booked', 'failed', 'booking_failed', 'resolved']
/** A payment SumUp has never heard of after this long was not started at the terminal. */
export const STALE_AFTER_SECONDS = 5 * 60
const MAX_FEE_REFRESH = 50

export const LATE_SUCCESS_ERROR = 'Zahlung nachträglich erfolgreich – prüfen, ob bar kassiert wurde'
const NOT_STARTED_REASON = 'Zahlung wurde am Terminal nicht gestartet'

/** The actor who started the payment, so finalize can re-validate as them. */
interface StoredActor {
  id: number
  kind: User['kind']
  affiliation_id: number | null
  username: string
}

interface StoredPayload {
  request: any
  actor: StoredActor
  /** The terminal offered tip rates. Absent on payments started before this was stored. */
  tip_prompt?: boolean
}

export interface CardPaymentRow {
  id: number
  client_uuid: string
  kind: CardPaymentKind
  status: CardPaymentStatus
  reader_id: number
  event_id: number
  stand_id: number | null
  cashier_id: number
  payload: string | StoredPayload
  amount: string | number
  tip_amount: string | number | null
  charged_amount: string | number | null
  fee_amount: string | number | null
  sumup_client_transaction_id: string | null
  sumup_transaction_id: string | null
  sumup_transaction_code: string | null
  webhook_token: string
  failure_reason: string | null
  booking_error: string | null
  resolution_note: string | null
  resolved_by: string | null
  started_at: string
  last_checked_at: string | null
  finalized_at: string | null
  order_id: number | null
  fachschaft_payment_id: number | null
  created_at: string
  sumup_checkout_id: string | null
  /** Seconds since created_at, computed by the database. */
  age_seconds: number
}

const ROW_SELECT = `SELECT cp.*, TIMESTAMPDIFF(SECOND, cp.created_at, CURRENT_TIMESTAMP) AS age_seconds FROM card_payments cp`

function parsePayload(row: CardPaymentRow): StoredPayload {
  return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
}

function money(value: unknown) {
  return value == null ? null : Number(value)
}

export async function loadCardPayment(clientUuid: string, conn?: mariadb.PoolConnection, forUpdate = false) {
  const rows: CardPaymentRow[] = normalizeBigInt(await query<CardPaymentRow[]>(
    `${ROW_SELECT} WHERE cp.client_uuid = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [clientUuid],
    conn,
  ))
  return rows[0] ?? null
}

/** What a till sees of a payment while it waits; never the payload or the webhook token. */
export function serializeCardPayment(row: CardPaymentRow) {
  return {
    client_uuid: row.client_uuid,
    kind: row.kind,
    status: row.status,
    amount: Number(row.amount),
    tip_amount: money(row.tip_amount),
    charged_amount: money(row.charged_amount),
    failure_reason: row.failure_reason,
    booking_error: row.booking_error,
    transaction_code: row.sumup_transaction_code,
    order_id: row.order_id,
    fachschaft_payment_id: row.fachschaft_payment_id,
    tip_prompt: parsePayload(row).tip_prompt !== false,
    stale: (row.status === 'created' || row.status === 'processing') && Number(row.age_seconds) > STALE_AFTER_SECONDS,
  }
}

export interface CardReaderRow {
  id: number
  sumup_reader_id: string
  name: string
  pairing_status: string
  is_active: number
}

/**
 * Whether card payments are possible at this event and stand: SumUp set up,
 * the global switch, the event's and the stand's flag, and an active paired
 * terminal assigned to the stand. The client mirrors this for the button.
 */
export async function resolveCardAvailability(input: { eventId: number, standId: number | null }):
Promise<{ ok: true, reader: CardReaderRow, standName: string } | { ok: false, error: string }> {
  if (!isCardConfigured()) return { ok: false, error: CARD_NOT_CONFIGURED_ERROR }

  const settings = await getCashRegisterSettings()
  if (!settings.card_payments_enabled) return { ok: false, error: 'Kartenzahlung ist deaktiviert' }

  const event = await getCashRegisterEventById(input.eventId)
  if (!event?.card_enabled) return { ok: false, error: 'Kartenzahlung ist für diese Veranstaltung deaktiviert' }

  if (input.standId == null) return { ok: false, error: 'Stand mit Terminal wählen' }

  const rows = normalizeBigInt(await query<any[]>(
    `SELECT s.name AS stand_name, s.card_enabled, s.is_active AS stand_active,
       r.id, r.sumup_reader_id, r.name, r.pairing_status, r.is_active
     FROM stands s
     LEFT JOIN card_readers r ON r.id = s.card_reader_id
     WHERE s.id = ?
     LIMIT 1`,
    [input.standId],
  )) as any[]
  const row = rows[0]
  if (!row) return { ok: false, error: 'Stand nicht gefunden' }
  if (!Number(row.card_enabled)) return { ok: false, error: 'Kartenzahlung ist an diesem Stand deaktiviert' }
  if (row.id == null || !Number(row.is_active)) return { ok: false, error: 'Diesem Stand ist kein Terminal zugewiesen' }
  if (row.pairing_status !== 'paired') return { ok: false, error: 'Das Terminal dieses Stands ist nicht gekoppelt' }

  return {
    ok: true,
    standName: String(row.stand_name),
    reader: {
      id: Number(row.id),
      sumup_reader_id: String(row.sumup_reader_id),
      name: String(row.name),
      pairing_status: String(row.pairing_status),
      is_active: Number(row.is_active),
    },
  }
}

/** A scoped guest only charges at the stands their affiliation runs at the event. */
async function canActorChargeAtStand(actor: ActorRef, eventId: number, standId: number) {
  const scope = getActorScope(actor)
  if (scope == null) return true
  const rows = await query<any[]>(
    `SELECT 1 AS allowed FROM event_affiliation_stands WHERE event_id = ? AND affiliation_id = ? AND stand_id = ? LIMIT 1`,
    [eventId, scope, standId],
  )
  return rows.length > 0
}

function webhookUrl(clientUuid: string, token: string) {
  const base = sumupConfig().webhookBaseUrl
  if (!base) return null
  return `${base}/api/sumup/webhook?p=${encodeURIComponent(clientUuid)}&t=${encodeURIComponent(token)}`
}

export interface StartCardPaymentInput {
  kind: unknown
  payload: any
  stand_id: unknown
}

/**
 * Validates a sale exactly like the cash endpoints, stores it as a pending
 * card payment and pushes the amount to the stand's terminal. Repeating the
 * call with the same client_uuid returns the existing payment.
 */
export async function startCardPayment(user: User, input: StartCardPaymentInput) {
  if (!isCardConfigured()) return { ok: false as const, error: CARD_NOT_CONFIGURED_ERROR }

  const kind = input.kind
  if (kind !== 'checkout' && kind !== 'fachschaft_payment') return { ok: false as const, error: 'Ungültige Zahlungsart' }

  const clientUuid = normalizeClientUuid(input.payload?.client_uuid)
  if (!clientUuid) return { ok: false as const, error: 'Missing or invalid client_uuid' }

  const existing = await loadCardPayment(clientUuid)
  if (existing) {
    if (existing.kind !== kind) return { ok: false as const, error: 'Missing or invalid client_uuid' }
    return { ok: true as const, payment: serializeCardPayment(existing) }
  }

  const committedCash = kind === 'checkout'
    ? await findCommittedCheckout(clientUuid)
    : await findCommittedFachschaftPayment(clientUuid)
  if (committedCash) return { ok: false as const, error: 'Diese Bestellung wurde bereits bar gebucht' }

  let amount: number
  let eventId: number
  let cashierId: number
  let standId: number | null
  let donationAmount = 0

  if (kind === 'checkout') {
    const prepared = await prepareCheckout(user, input.payload)
    if (!prepared.ok) return prepared
    const { plan } = prepared
    // A payout (negative total) is always cash; so is a free order without donation.
    if (plan.total < 0) return { ok: false as const, error: 'Auszahlungen sind nur bar möglich' }
    amount = round2(plan.total + plan.donationAmount)
    donationAmount = plan.donationAmount
    eventId = plan.eventId
    cashierId = plan.cashierId
    standId = plan.standId
  } else {
    const prepared = await prepareFachschaftPayment(user, input.payload)
    if (!prepared.ok) return prepared
    amount = prepared.plan.amount
    eventId = prepared.plan.eventId
    cashierId = prepared.plan.cashierId
    const rawStand = Number(input.stand_id)
    standId = Number.isInteger(rawStand) && rawStand > 0 ? rawStand : null
  }

  if (!(amount > 0)) return { ok: false as const, error: 'Kartenzahlung nur für Beträge über 0 €' }
  if (kind === 'checkout' && input.stand_id != null && Number(input.stand_id) !== standId) {
    return { ok: false as const, error: 'Stand stimmt nicht mit der Bestellung überein' }
  }

  const availability = await resolveCardAvailability({ eventId, standId })
  if (!availability.ok) return availability
  if (!await canActorChargeAtStand(user, eventId, standId!)) {
    return { ok: false as const, error: 'Dieser Stand ist für deine Zugehörigkeit nicht freigegeben' }
  }

  const settings = await getCashRegisterSettings()
  const event = await getCashRegisterEventById(eventId)
  const token = randomBytes(32).toString('hex')
  // Only sales ask for a tip; one that already holds a donation only when the setting opts in.
  const tipRates = kind === 'checkout' && (donationAmount <= 0 || settings.card_tip_with_donation)
    ? settings.card_tip_rates
    : []
  const stored: StoredPayload = {
    request: { ...input.payload, client_uuid: clientUuid },
    actor: { id: user.id, kind: user.kind, affiliation_id: user.affiliation_id, username: user.username },
    tip_prompt: tipRates.length > 0,
  }

  const reader = availability.reader
  const inserted = await withTransaction(async (conn) => {
    // One payment per terminal at a time: two tills must not drive the same device.
    await query(`SELECT id FROM card_readers WHERE id = ? FOR UPDATE`, [reader.id], conn)
    const busy = await query<any[]>(
      `SELECT id FROM card_payments
       WHERE reader_id = ? AND status IN ('created', 'processing')
         AND created_at > CURRENT_TIMESTAMP - INTERVAL ${STALE_AFTER_SECONDS} SECOND
       LIMIT 1`,
      [reader.id],
      conn,
    )
    if (busy.length) return false

    await query(
      `INSERT INTO card_payments
         (client_uuid, kind, status, reader_id, event_id, stand_id, cashier_id, payload, amount, webhook_token, started_at)
       VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientUuid, kind, reader.id, eventId, standId, cashierId, JSON.stringify(stored),
        amount.toFixed(2), token, berlinLocalNow()],
      conn,
    )
    return true
  })
  if (!inserted) return { ok: false as const, error: 'Terminal ist gerade mit einer anderen Zahlung beschäftigt' }

  const checkout = await sumup().createReaderCheckout(reader.sumup_reader_id, {
    cents: Math.round(amount * 100),
    tipRates,
    returnUrl: webhookUrl(clientUuid, token),
    foreignId: clientUuid,
    description: [event?.name, availability.standName].filter(Boolean).join(' · '),
  })

  if (!checkout.ok) {
    await query(
      `UPDATE card_payments SET status = 'failed', failure_reason = ?, finalized_at = CURRENT_TIMESTAMP WHERE client_uuid = ? AND status = 'created'`,
      [checkout.error.slice(0, 500), clientUuid],
    )
    return { ok: false as const, error: checkout.error }
  }

  await query(
    `UPDATE card_payments SET status = 'processing', sumup_client_transaction_id = ?, sumup_checkout_id = ? WHERE client_uuid = ? AND status = 'created'`,
    [checkout.clientTransactionId, checkout.checkoutId, clientUuid],
  )

  const row = await loadCardPayment(clientUuid)
  return { ok: true as const, payment: serializeCardPayment(row!) }
}

type PreparedBooking =
  | { kind: 'checkout', plan: CheckoutPlan }
  | { kind: 'fachschaft_payment', plan: FachschaftPaymentPlan }

/**
 * Re-validates the stored sale as the stored actor — prices, cashier, event
 * access, Fachschaft rules — without writing. Runs outside the booking
 * transaction (it reads on its own connections); voucher units and validity
 * are checked under lock while booking, exactly like a cash checkout.
 */
async function prepareStoredPayment(row: CardPaymentRow): Promise<{ ok: true, prepared: PreparedBooking } | { ok: false, error: string }> {
  const { request, actor } = parsePayload(row)

  if (row.kind === 'checkout') {
    const prepared = await prepareCheckout(actor, request)
    if (!prepared.ok) return prepared
    const amount = round2(prepared.plan.total + prepared.plan.donationAmount)
    if (Math.round(amount * 100) !== Math.round(Number(row.amount) * 100)) {
      return { ok: false, error: 'Der Bestellbetrag hat sich seit dem Start der Zahlung geändert' }
    }
    return { ok: true, prepared: { kind: 'checkout', plan: prepared.plan } }
  }

  const prepared = await prepareFachschaftPayment(actor, request)
  if (!prepared.ok) return prepared
  return { ok: true, prepared: { kind: 'fachschaft_payment', plan: prepared.plan } }
}

/** Books a prepared sale on `conn`. Throws (VoucherBookingError, DB errors) when it is not possible any more. */
async function bookPreparedPayment(row: CardPaymentRow, prepared: PreparedBooking, tx: SumupTransaction, conn: mariadb.PoolConnection) {
  if (prepared.kind === 'checkout') {
    const { orderId } = await bookCheckout(prepared.plan, {
      clientUuid: row.client_uuid,
      paymentMethod: 'card',
      extraDonation: round2(tx.tipAmount),
      at: String(row.started_at),
    }, conn)
    return { orderId, fachschaftPaymentId: null }
  }

  const paymentId = await bookFachschaftPayment(prepared.plan, { clientUuid: row.client_uuid, paymentMethod: 'card' }, conn)
  return { orderId: null, fachschaftPaymentId: paymentId }
}

function failureReason(status: string) {
  return status === 'CANCELLED' ? 'Zahlung am Terminal abgebrochen' : 'Zahlung abgelehnt oder fehlgeschlagen'
}

/**
 * While SumUp has no transaction yet, the reader checkout tells whether the
 * terminal gave up: the card was never presented within the 60 s window, or
 * the checkout was cancelled. Returns the failure reason, or null when the
 * checkout is still open (or its status is unavailable — then the 5 minute
 * rule still applies).
 */
async function expiredCheckoutReason(row: CardPaymentRow) {
  if (!row.sumup_checkout_id) return null
  const readers = await query<Array<{ sumup_reader_id: string }>>(
    `SELECT sumup_reader_id FROM card_readers WHERE id = ? LIMIT 1`,
    [row.reader_id],
  )
  if (!readers[0]) return null

  const fetched = await sumup().getReaderCheckout(readers[0].sumup_reader_id, row.sumup_checkout_id)
  const checkout = fetched.ok ? fetched.checkout : null
  if (checkout?.status === 'cancelled') return 'Zahlung am Terminal abgebrochen'
  if (checkout?.status === 'failed') return 'Keine Karte vorgehalten oder Zahlung fehlgeschlagen'
  return null
}

export interface FinalizeOptions {
  /** Admin: re-run the booking of a booking_failed payment. */
  retryBooking?: boolean
  /** Admin: ask SumUp again about a payment we marked failed (a late success lands in booking_failed). */
  recheckFailed?: boolean
}

/**
 * The single place that moves a card payment to its final state. Idempotent
 * and safe to call concurrently (webhook, polling, admin re-check). SumUp is
 * asked and the stored sale re-validated before any lock is taken (so no
 * connection or row lock is held across an HTTP call); then the row is locked,
 * its status re-checked — a concurrent caller may have finished it — and the
 * outcome written. On success the booking and the status change commit
 * together; a booking that fails is rolled back to a savepoint and the payment
 * is marked booking_failed — the money is taken, so that state is always
 * persisted.
 */
export async function finalizeCardPayment(clientUuid: string, options: FinalizeOptions = {}) {
  const row = await loadCardPayment(clientUuid)
  if (!row) return null

  const wants = (current: CardPaymentRow) => ({
    retryBooking: Boolean(options.retryBooking) && current.status === 'booking_failed',
    recheckFailed: Boolean(options.recheckFailed) && current.status === 'failed',
  })
  const isDone = (current: CardPaymentRow) => {
    const { retryBooking, recheckFailed } = wants(current)
    return FINAL_STATUSES.includes(current.status) && !retryBooking && !recheckFailed
  }
  if (isDone(row)) return row

  const fetched = row.sumup_client_transaction_id ? await sumup().getTransaction(row.sumup_client_transaction_id) : null
  const tx = fetched?.ok ? fetched.transaction : null
  const expiredReason = fetched?.ok && !tx && row.status === 'processing' ? await expiredCheckoutReason(row) : null
  const prepared = tx?.status === 'SUCCESSFUL' && !wants(row).recheckFailed ? await prepareStoredPayment(row) : null

  return withTransaction(async (conn) => {
    const locked = await loadCardPayment(clientUuid, conn, true)
    if (!locked) return null
    // Another caller finished it (or moved it) while we were asking SumUp.
    if (isDone(locked) || locked.status !== row.status) return locked
    const { recheckFailed } = wants(locked)

    const touch = () => query(`UPDATE card_payments SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?`, [locked.id], conn)
    const markFailed = (reason: string) => query(
      `UPDATE card_payments SET status = 'failed', failure_reason = ?, last_checked_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason, locked.id],
      conn,
    )

    if (!locked.sumup_client_transaction_id) {
      // Never reached the terminal (crashed between insert and push).
      if (locked.status === 'created' && Number(locked.age_seconds) > STALE_AFTER_SECONDS) await markFailed(NOT_STARTED_REASON)
      return loadCardPayment(clientUuid, conn)
    }

    if (!fetched?.ok) {
      await touch()
      return loadCardPayment(clientUuid, conn)
    }

    if (!tx || tx.status === 'PENDING') {
      // Never fail a payment SumUp still reports as pending. Without any
      // transaction it failed once the terminal gave up on the checkout — or,
      // if that status is unavailable, after the stale timeout.
      if (!tx && locked.status === 'processing' && expiredReason) await markFailed(expiredReason)
      else if (!tx && locked.status === 'processing' && Number(locked.age_seconds) > STALE_AFTER_SECONDS) await markFailed(NOT_STARTED_REASON)
      else await touch()
      return loadCardPayment(clientUuid, conn)
    }

    if (tx.status !== 'SUCCESSFUL') {
      if (locked.status !== 'failed') await markFailed(failureReason(tx.status))
      else await touch()
      return loadCardPayment(clientUuid, conn)
    }

    await query(
      `UPDATE card_payments
       SET charged_amount = ?, tip_amount = ?, fee_amount = COALESCE(?, fee_amount),
         sumup_transaction_id = ?, sumup_transaction_code = ?, last_checked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tx.amount.toFixed(2), tx.tipAmount.toFixed(2), tx.feeAmount == null ? null : tx.feeAmount.toFixed(2),
        tx.transactionId, tx.transactionCode, locked.id],
      conn,
    )

    const markBookingFailed = async (message: string) => {
      await query(
        `UPDATE card_payments SET status = 'booking_failed', booking_error = ?, finalized_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [message.slice(0, 500), locked.id],
        conn,
      )
      return loadCardPayment(clientUuid, conn)
    }

    // We already told the till it failed — the customer may have paid cash instead.
    if (recheckFailed) return markBookingFailed(LATE_SUCCESS_ERROR)

    const chargedCents = Math.round(tx.amount * 100) - Math.round(tx.tipAmount * 100)
    if (chargedCents !== Math.round(Number(locked.amount) * 100)) {
      return markBookingFailed(`Betrag am Terminal (${(chargedCents / 100).toFixed(2)} €) stimmt nicht mit der Bestellung (${Number(locked.amount).toFixed(2)} €) überein`)
    }

    if (!prepared) return markBookingFailed('Buchung fehlgeschlagen')
    if (!prepared.ok) return markBookingFailed(prepared.error)

    await query(`SAVEPOINT card_booking`, [], conn)
    try {
      const booked = await bookPreparedPayment(locked, prepared.prepared, tx, conn)
      await query(
        `UPDATE card_payments
         SET status = 'booked', booking_error = NULL, order_id = ?, fachschaft_payment_id = ?, finalized_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [booked.orderId, booked.fachschaftPaymentId, locked.id],
        conn,
      )
    } catch (error: any) {
      await query(`ROLLBACK TO SAVEPOINT card_booking`, [], conn)
      const known = error instanceof VoucherBookingError
      if (!known) console.error('[card-payments] booking failed', clientUuid, error)
      return markBookingFailed(known ? error.message : 'Buchung fehlgeschlagen (Datenbankfehler)')
    }

    return loadCardPayment(clientUuid, conn)
  })
}

/** Payments whose fee SumUp has not reported yet: fetched one by one, capped per call. */
export async function refreshCardFees(eventId: number) {
  const rows = await query<Array<{ id: unknown, sumup_client_transaction_id: string }>>(
    `SELECT id, sumup_client_transaction_id
     FROM card_payments
     WHERE event_id = ? AND status = 'booked' AND fee_amount IS NULL AND sumup_client_transaction_id IS NOT NULL
     ORDER BY id
     LIMIT ${MAX_FEE_REFRESH}`,
    [eventId],
  )

  let updated = 0
  for (const row of rows) {
    const fetched = await sumup().getTransaction(row.sumup_client_transaction_id)
    if (!fetched.ok) break
    const fee = fetched.transaction?.feeAmount
    if (fee == null) continue
    await query(`UPDATE card_payments SET fee_amount = ? WHERE id = ?`, [fee.toFixed(2), row.id])
    updated += 1
  }

  const remaining = await query<Array<{ count: unknown }>>(
    `SELECT COUNT(*) AS count FROM card_payments WHERE event_id = ? AND status = 'booked' AND fee_amount IS NULL`,
    [eventId],
  )
  return { checked: rows.length, updated, remaining: Number(remaining[0]?.count ?? 0) }
}

/** The SQL condition (alias cp) for payments that need an admin: booking failed, or stuck at the terminal. */
export const PROBLEM_SQL = `(cp.status = 'booking_failed'
  OR (cp.status IN ('created', 'processing') AND cp.created_at < CURRENT_TIMESTAMP - INTERVAL ${STALE_AFTER_SECONDS} SECOND))`
