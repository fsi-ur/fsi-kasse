import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { canRemoveReader, DELETED_PAIRING_STATUS, getCardReader } from '~/server/utils/cardReaders'
import { CARD_NOT_CONFIGURED_ERROR, isCardConfigured, sumup } from '~/server/utils/sumup'

// Removes the terminal at SumUp, then soft-deletes it here (card payments keep
// referencing it) and takes it off every stand. The device itself must be
// disconnected too: Connections → API → Disconnect. Guest managers remove only
// the terminals their association paired.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, ['cash_register.manage', 'cash_register.guest_manage'])
  if (!current.ok) return current
  if (!isCardConfigured()) return { ok: false, error: CARD_NOT_CONFIGURED_ERROR }

  const reader = await getCardReader(Number((await readBody(event))?.id))
  if (!reader || reader.pairing_status === DELETED_PAIRING_STATUS) return { ok: false, error: 'Terminal nicht gefunden' }
  if (!canRemoveReader(current.user, reader)) return { ok: false, error: 'Nicht berechtigt' }

  const pending = await query<any[]>(
    `SELECT id FROM card_payments WHERE reader_id = ? AND status IN ('created', 'processing') LIMIT 1`,
    [reader.id],
  )
  if (pending.length) return { ok: false, error: 'Auf diesem Terminal läuft noch eine Zahlung' }

  const removed = await sumup().deleteReader(reader.sumup_reader_id)
  if (!removed.ok) return { ok: false, error: removed.error }

  await withTransaction(async (conn) => {
    await query(`UPDATE stands SET card_reader_id = NULL WHERE card_reader_id = ?`, [reader.id], conn)
    await query(`UPDATE card_readers SET is_active = 0, pairing_status = ? WHERE id = ?`, [DELETED_PAIRING_STATUS, reader.id], conn)
  })
  return { ok: true }
})
