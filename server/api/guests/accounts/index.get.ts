import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { getActorScope } from '~/server/utils/affiliations'
import { listGuestAccounts } from '~/server/utils/guests'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const scope = getActorScope(current.user)
  const guests = await listGuestAccounts(scope ?? undefined)

  return { ok: true, guests }
})
