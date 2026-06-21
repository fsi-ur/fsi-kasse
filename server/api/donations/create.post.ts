import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, amount, order_id = null } = await readBody(event)

  if (!cashier_id || !event_id || !amount || Number(amount) <= 0) {
    return { ok: false, error: 'Missing or invalid donation details' }
  }

  const selectedCashier = await getCashRegisterCashierById(Number(cashier_id))
  if (!selectedCashier) return { ok: false, error: 'Selected cashier does not exist' }
  if (!selectedCashier.is_active) return { ok: false, error: 'Selected cashier is not active' }

  const selectedEvent = await getCashRegisterEventById(Number(event_id))
  if (!selectedEvent) return { ok: false, error: 'Selected event does not exist' }
  if (!selectedEvent.is_active) return { ok: false, error: 'Selected event is not active' }

  const result = await query(
    `INSERT INTO donations (event_id, cashier_id, amount, order_id) VALUES (?, ?, ?, ?)`,
    [event_id, cashier_id, Number(amount).toFixed(2), order_id ?? null]
  )

  return { ok: true, donation_id: normalizeBigInt((result as any).insertId) }
})
