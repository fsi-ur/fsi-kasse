import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { getOwnedStandIds } from '~/server/utils/stands'
import { isAssignableReader } from '~/server/utils/cardReaders'

// A guest manager picks the terminal of one of their own stands. Whether the
// stand takes cards at all (card_enabled) stays with the admins.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }
  if (!(await getOwnedStandIds(current.user)).includes(id)) return { ok: false, error: 'Nicht berechtigt' }

  const readerId = body?.card_reader_id == null || body.card_reader_id === '' ? null : Number(body.card_reader_id)
  if (readerId !== null && !await isAssignableReader(readerId)) return { ok: false, error: 'Terminal nicht verfügbar' }

  await query(`UPDATE stands SET card_reader_id = ? WHERE id = ?`, [readerId, id])
  return { ok: true }
})
