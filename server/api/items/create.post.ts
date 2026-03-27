import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { name, price, deposit = 0, image, is_active = 1 } = await readBody(event)
  if (!name || !price) return { ok: false, error: 'Missing fields' }

  await query(`INSERT INTO items (name, price, deposit, image, is_active) VALUES (?, ?, ?, ?, ?)`, [name, price, deposit, image, is_active])
  return { ok: true }
})
