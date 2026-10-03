import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { resolveAssignableAffiliation } from '~/server/utils/affiliations'
import { parseCashierName } from '~/server/utils/cashiers'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const name = parseCashierName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  const isActive = body?.is_active ?? 1
  if (isActive != 0 && isActive != 1) return { ok: false, error: 'Ungültiger Wert für is_active' }

  const affiliation = await resolveAssignableAffiliation(current.user, body?.affiliation_id)
  if (!affiliation.ok) return affiliation

  await query(
    `INSERT INTO cashiers (name, image, is_active, is_guest, affiliation_id)
     VALUES (?, NULL, ?, 1, ?)`,
    [name, isActive ? 1 : 0, affiliation.affiliationId],
  )

  return { ok: true }
})
