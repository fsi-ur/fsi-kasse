import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { deleteGuestSessions, loadManageableGuestAccount } from '~/server/utils/guests'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestAccount(current.user, body?.id)
  if (!target.ok) return target

  const isActive = body?.is_active
  if (isActive != 0 && isActive != 1) return { ok: false, error: 'Ungültiger Wert für is_active' }

  await withTransaction(async (conn) => {
    await query(`UPDATE guest_users SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, target.guest.id], conn)
    if (!isActive) await deleteGuestSessions(target.guest.id, conn)
  })

  return { ok: true }
})
