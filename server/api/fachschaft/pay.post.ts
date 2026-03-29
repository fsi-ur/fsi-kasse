import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'

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

  const result = await query(
    `INSERT INTO fachschaft_payments (member_id, cashier_id, event_id) VALUES (?, ?, ?)`,
    [member_id, cashier_id, event_id]
  )

  const payment_id = normalizeBigInt((result as any).insertId)

  return { ok: true, order_id: normalizeBigInt(payment_id) }
})
