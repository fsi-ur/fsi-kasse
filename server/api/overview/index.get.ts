import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { loadEventOverview, parseStandFilter } from '~/server/utils/overview'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const eventId = Number(getQuery(event).eventId)
  if (!eventId) {
    return { ok: false, error: 'Missing eventId' }
  }

  const stand = parseStandFilter(getQuery(event).standId)
  if (!stand) {
    return { ok: false, error: 'Invalid standId' }
  }

  return { ok: true, ...await loadEventOverview(eventId, stand) }
})
