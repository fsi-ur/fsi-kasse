import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { loadManageableGuestAccount } from '~/server/utils/guests'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage', { touch: false })
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestAccount(current.user, body?.id)
  if (!target.ok) return target

  await query(`UPDATE guest_users SET must_change_password = 1 WHERE id = ?`, [target.guest.id])
  return { ok: true }
})
