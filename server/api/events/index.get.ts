import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { getCashRegisterEvents } from '~/server/utils/events'
import { isConnectedAccountingMode } from '~/server/utils/db'
import { getActorScope, listEventAffiliations } from '~/server/utils/affiliations'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const scope = getActorScope(current.user)
  const affiliationsByEvent = await listEventAffiliations()

  // Scoped guests only see events that allow their affiliation, and only their own entry.
  const rows = (await getCashRegisterEvents()).flatMap((entry) => {
    const affiliations = affiliationsByEvent.get(entry.id) ?? []
    if (scope == null) return [{ ...entry, affiliations }]

    const own = affiliations.filter(affiliation => affiliation.affiliation_id === scope)
    return own.length ? [{ ...entry, affiliations: own }] : []
  })

  return { ok: true, events: rows, read_only: isConnectedAccountingMode() }
})
