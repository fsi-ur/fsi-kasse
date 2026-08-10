import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'
import { getCashRegisterSettings } from '~/server/utils/appSettings'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, member_id } = await readBody(event)

  if (!cashier_id || !event_id || !member_id) {
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

  // The amount is snapshotted from the current setting, never from the request
  // body, so a later settings change does not revalue this payment.
  const settings = await getCashRegisterSettings()

  const result = await query(
    `INSERT INTO fachschaft_payments (member_id, cashier_id, event_id, amount) VALUES (?, ?, ?, ?)`,
    [member_id, cashier_id, event_id, settings.fachschaft_payment_amount.toFixed(2)]
  )

  const payment_id = normalizeBigInt((result as any).insertId)

  return {
    ok: true,
    payment_id: normalizeBigInt(payment_id),
    order_id: normalizeBigInt(payment_id),
    amount: settings.fachschaft_payment_amount,
  }
})
