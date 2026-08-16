import { defineEventHandler, readBody } from 'h3'
import { isConnectedAccountingMode, query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  if (isConnectedAccountingMode()) {
    return { ok: false, error: 'Event management is disabled in connected mode' }
  }

  const { name, starts_at, ends_at, is_active = 1 } = await readBody(event)
  if (!name || !starts_at || !ends_at) return { ok: false, error: 'Missing fields' }
  if (new Date(String(ends_at).replace(' ', 'T')) < new Date(String(starts_at).replace(' ', 'T'))) {
    return { ok: false, error: 'End date must not be before start date' }
  }

  await query(`INSERT INTO events (name, starts_at, ends_at, is_active) VALUES (?, ?, ?, ?)`, [name, starts_at, ends_at, is_active])
  return { ok: true }
})
