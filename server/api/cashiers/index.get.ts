import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { getCashRegisterCashiers } from '~/server/utils/cashiers'
import { isConnectedAccountingMode } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const rows = await getCashRegisterCashiers()
  return { ok: true, cashiers: rows, read_only: isConnectedAccountingMode() }
})
