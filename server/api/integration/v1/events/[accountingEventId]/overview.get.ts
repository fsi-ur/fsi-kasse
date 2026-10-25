import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { query } from '~/server/utils/db'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import { isCardConfigured } from '~/server/utils/sumup'
import { loadEventOverview, parseStandFilter } from '~/server/utils/overview'
import { requireIntegrationKey } from '~/server/utils/integration/auth'
import { buildEventOverviewTotals, buildEventOverviewView, standFilterValues } from '~/server/utils/integration/eventOverviewView'
import { INTEGRATION_CONTRACT_VERSION, type IntegrationEventOverviewResponse } from '~/server/utils/integration/viewContract'
import { isLanguage } from '~/shared/i18n'

// The event overview for the accounting app, addressed by the accounting's
// own event id. Authenticated with the integration key, not a user session —
// the Buchhaltung checks its user's permission before calling.
export default defineEventHandler(async (event): Promise<IntegrationEventOverviewResponse> => {
  const auth = requireIntegrationKey(event)
  if (!auth.ok) return auth

  const accountingEventId = Number(getRouterParam(event, 'accountingEventId'))
  if (!Number.isInteger(accountingEventId) || accountingEventId <= 0) {
    return { ok: false, error: 'Invalid event id' }
  }

  const params = getQuery(event)
  const language = isLanguage(params.locale) ? params.locale : 'de'
  let standValue = params.standId == null || params.standId === '' ? 'all' : String(params.standId)
  let stand = parseStandFilter(standValue)
  if (!stand) {
    return { ok: false, error: 'Invalid standId' }
  }

  const eventRows = await query<Array<{ id: number, name: string, fachschaft_enabled: number }>>(
    `SELECT id, name, fachschaft_enabled
     FROM events
     WHERE accounting_event_id = ?
     LIMIT 1`,
    [accountingEventId],
  )
  const localEvent = eventRows[0]
  if (!localEvent) {
    return { ok: true, contractVersion: INTEGRATION_CONTRACT_VERSION, linked: false }
  }

  const eventId = Number(localEvent.id)
  let overview = await loadEventOverview(eventId, stand)

  // A filter for a stand the event has no data for (e.g. kept from another
  // event) falls back to the whole event, like the till's own overview.
  if (standValue !== 'all' && !standFilterValues(overview).includes(standValue)) {
    standValue = 'all'
    stand = parseStandFilter(standValue)!
    overview = await loadEventOverview(eventId, stand)
  }

  // The totals always cover the whole event, independent of the filter.
  const wholeEvent = standValue === 'all' ? overview : await loadEventOverview(eventId, parseStandFilter('all')!)

  const settings = await getCashRegisterSettings()
  const showFachschaft = (settings.fachschaft_enabled && Number(localEvent.fachschaft_enabled) !== 0)
    || overview.payments.count > 0
    || overview.fachschaft.items.length > 0
  // Card figures only matter where card payments exist (SumUp set up, or past card sales).
  const showCard = isCardConfigured()
    || overview.card.payment_count > 0
    || overview.regular.cardRevenue !== 0

  const view = buildEventOverviewView({ language, overview, standValue, showFachschaft, showCard })

  return {
    ok: true,
    contractVersion: INTEGRATION_CONTRACT_VERSION,
    linked: true,
    event: { id: eventId, name: String(localEvent.name) },
    generatedAt: new Date().toISOString(),
    totals: buildEventOverviewTotals(wholeEvent),
    filters: view.filters,
    sections: view.sections,
  }
})
