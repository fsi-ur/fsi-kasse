import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'
import { getCashRegisterSettings, isKnownFachschaftPaymentAmount } from '~/server/utils/appSettings'
import { isDuplicateEntryError, normalizeClientUuid } from '~/server/utils/checkout'

async function findCommittedPayment(clientUuid: string) {
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

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, member_id, client_uuid, amount } = await readBody(event)

  // Optional: live callers may omit it, but a value that is present must be valid.
  const clientUuid = client_uuid == null ? null : normalizeClientUuid(client_uuid)
  if (client_uuid != null && !clientUuid) {
    return { ok: false, error: 'Missing or invalid client_uuid' }
  }

  if (clientUuid) {
    const committed = await findCommittedPayment(clientUuid)
    if (committed) return committed
  }

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

  const bookedAmount = requestedAmount ?? settings.fachschaft_payment_amount

  let result
  try {
    result = await query(
      `INSERT INTO fachschaft_payments (member_id, cashier_id, event_id, amount, client_uuid) VALUES (?, ?, ?, ?, ?)`,
      [member_id, cashier_id, event_id, bookedAmount.toFixed(2), clientUuid]
    )
  } catch (error) {
    if (!clientUuid || !isDuplicateEntryError(error)) throw error

    const replayed = await findCommittedPayment(clientUuid)
    if (replayed) return replayed
    throw error
  }

  const payment_id = normalizeBigInt((result as any).insertId)

  return {
    ok: true,
    payment_id: normalizeBigInt(payment_id),
    order_id: normalizeBigInt(payment_id),
    amount: bookedAmount,
  }
})
