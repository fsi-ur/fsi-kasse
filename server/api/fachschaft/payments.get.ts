import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

  const rows = await query(`
    SELECT 
      p.id AS payment_id,
      p.created_at,
      p.amount,
      m.name AS member_name,
      c.name AS cashier_name
    FROM fachschaft_payments p
    JOIN cashiers c ON p.cashier_id = c.id
    JOIN cashiers m ON p.member_id = m.id
    WHERE p.event_id = ?
    ORDER BY p.created_at DESC, p.id DESC
  `, [eventId])

  const data = normalizeBigInt(rows)
  const payments: any[] = []

  for (const row of data as any[]) {
    let payment = payments.find(entry => entry.id === row.payment_id)
    if (!payment) {
      payment = {
        id: row.payment_id,
        cashier: row.cashier_name,
        member: row.member_name,
        // The amount stored on the payment, not the current setting.
        amount: Number(row.amount),
        created_at: row.created_at,
      }
      payments.push(payment)
    }
  }

  return { ok: true, payments }
})
