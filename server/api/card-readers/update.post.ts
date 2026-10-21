import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { DELETED_PAIRING_STATUS, getCardReader, parseReaderName } from '~/server/utils/cardReaders'

// Renames a terminal or (de)activates it. A deactivated terminal stays
// assigned to its stands, but no card payment can start on it.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const reader = await getCardReader(Number(body?.id))
  if (!reader || reader.pairing_status === DELETED_PAIRING_STATUS) return { ok: false, error: 'Terminal nicht gefunden' }

  const name = body?.name === undefined ? reader.name : parseReaderName(body.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  if (body?.is_active !== undefined && typeof body.is_active !== 'boolean') {
    return { ok: false, error: 'Ungültiger Wert für is_active' }
  }
  const isActive = body?.is_active ?? reader.is_active

  await query(`UPDATE card_readers SET name = ?, is_active = ? WHERE id = ?`, [name, isActive ? 1 : 0, reader.id])
  return { ok: true }
})
