import { defineEventHandler, readBody } from 'h3'
import { isConnectedAccountingMode, query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'Cashier management is disabled in connected mode' }
  }

  const { id } = await readBody(event)
  if (!id) return { ok: false, error: 'Missing ID' }

  await query(`DELETE FROM cashiers WHERE id = ?`, [id])
  return { ok: true }
})
