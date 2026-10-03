import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { loadManageableGuestCashier } from '~/server/utils/cashiers'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestCashier(current.user, body?.id)
  if (!target.ok) return target

  const cashierId = target.cashier.id
  const deleted = await withTransaction(async (conn) => {
    await query(`SELECT id FROM cashiers WHERE id = ? FOR UPDATE`, [cashierId], conn)
    const rows = await query<{ booking_count: number }[]>(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE cashier_id = ?)
         + (SELECT COUNT(*) FROM donations WHERE cashier_id = ?)
         + (SELECT COUNT(*) FROM fachschaft_payments WHERE cashier_id = ? OR member_id = ?) AS booking_count`,
      [cashierId, cashierId, cashierId, cashierId],
      conn,
    )
    if (Number(rows[0]?.booking_count ?? 0) > 0) return false

    await query(`DELETE FROM cashiers WHERE id = ? AND is_guest = 1`, [cashierId], conn)
    return true
  })

  if (!deleted) return { ok: false, error: 'Kassierer hat bereits Buchungen – bitte deaktivieren' }

  return { ok: true }
})
