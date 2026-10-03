import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { resolveAssignableAffiliation } from '~/server/utils/affiliations'
import { loadManageableGuestCashier, parseCashierName } from '~/server/utils/cashiers'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestCashier(current.user, body?.id)
  if (!target.ok) return target

  const name = parseCashierName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  const affiliation = await resolveAssignableAffiliation(current.user, body?.affiliation_id, target.cashier.affiliation_id)
  if (!affiliation.ok) return affiliation

  await query(
    `UPDATE cashiers SET name = ?, affiliation_id = ? WHERE id = ? AND is_guest = 1`,
    [name, affiliation.affiliationId, target.cashier.id],
  )

  return { ok: true }
})
