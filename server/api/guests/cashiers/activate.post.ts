import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { loadManageableGuestCashier } from '~/server/utils/cashiers'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestCashier(current.user, body?.id)
  if (!target.ok) return target

  const isActive = body?.is_active
  if (isActive != 0 && isActive != 1) return { ok: false, error: 'Ungültiger Wert für is_active' }

  await query(`UPDATE cashiers SET is_active = ? WHERE id = ? AND is_guest = 1`, [isActive ? 1 : 0, target.cashier.id])
  return { ok: true }
})
