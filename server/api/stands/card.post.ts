import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { isAssignableReader } from '~/server/utils/cardReaders'

// Enables card payments at a stand and picks its terminal. Admins only: card
// money always lands in the till's own SumUp account, so a guest manager must never
// switch it on.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }
  if (typeof body?.card_enabled !== 'boolean') return { ok: false, error: 'Ungültiger Wert für card_enabled' }

  const readerId = body?.card_reader_id == null || body.card_reader_id === '' ? null : Number(body.card_reader_id)
  if (readerId !== null && !await isAssignableReader(readerId)) return { ok: false, error: 'Terminal nicht verfügbar' }

  const existing = await query<Array<{ id: unknown }>>(`SELECT id FROM stands WHERE id = ? LIMIT 1`, [id])
  if (!existing[0]) return { ok: false, error: 'Stand nicht gefunden' }

  await query(`UPDATE stands SET card_enabled = ?, card_reader_id = ? WHERE id = ?`, [body.card_enabled ? 1 : 0, readerId, id])
  return { ok: true }
})
