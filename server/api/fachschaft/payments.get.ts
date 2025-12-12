import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  if (!user) return { ok: false, error: 'Not authenticated' }

  const rows = await query(`
    SELECT 
      p.id AS payment_id,
      p.created_at,
      m.name AS member_name,
      c.name AS cashier_name
    FROM fachschaft_payments p
    JOIN cashiers c ON p.cashier_id = c.id
    JOIN cashiers m ON p.member_id = m.id
    ORDER BY p.created_at DESC, p.id DESC
  `)

  const data = normalizeBigInt(rows)

  const payments: any[] = []
  for (const row of data) {
    let payment = payments.find(p => p.id === row.payment_id)
    if (!payment) {
      payment = {
        id: row.payment_id,
        cashier: row.cashier_name,
        member: row.member_name,
        created_at: row.created_at,
      }
      payments.push(payment)
    }
  }

  return { ok: true, payments }
})