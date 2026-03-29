import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { getCashRegisterEvents } from '~/server/utils/events'
import { isConnectedAccountingMode } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const rows = await getCashRegisterEvents()
  return { ok: true, events: rows, read_only: isConnectedAccountingMode() }
})
