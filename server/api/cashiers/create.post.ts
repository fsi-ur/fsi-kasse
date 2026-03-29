import { defineEventHandler, readBody } from 'h3'
import { isConnectedAccountingMode, query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'Cashier management is disabled in connected mode' }
  }

  const { name, image, is_active = 1 } = await readBody(event)
  if (!name) return { ok: false, error: 'Missing fields' }

  await query(`INSERT INTO cashiers (name, image, is_active) VALUES (?, ?, ?)`, [name, image, is_active])
  return { ok: true }
})
