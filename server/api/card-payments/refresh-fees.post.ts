import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { refreshCardFees } from '~/server/utils/cardPayments'
import { CARD_NOT_CONFIGURED_ERROR, isCardConfigured } from '~/server/utils/sumup'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current
  if (!isCardConfigured()) return { ok: false, error: CARD_NOT_CONFIGURED_ERROR }

  const eventId = Number((await readBody(event))?.event_id)
  if (!Number.isInteger(eventId) || eventId <= 0) return { ok: false, error: 'Missing eventId' }

  return { ok: true, ...(await refreshCardFees(eventId)) }
})
