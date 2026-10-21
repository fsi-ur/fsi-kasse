import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { hasPermission, requirePermission } from '~/server/utils/api/guards'
import { getActorScope } from '~/server/utils/affiliations'
import { isDuplicateEntryError } from '~/server/utils/checkout'
import { parseReaderName } from '~/server/utils/cardReaders'
import { getOwnedStandIds } from '~/server/utils/stands'
import { CARD_NOT_CONFIGURED_ERROR, isCardConfigured, sumup } from '~/server/utils/sumup'

// SumUp: 8 or 9 alphanumeric characters, shown on the device.
const PAIRING_CODE = /^[A-Z0-9]{8,9}$/

// Pairs a Solo: the device shows a code under Connections → API → Connect
// (valid 5 minutes), SumUp links it to the merchant account. A guest manager
// pairs for one of their own stands and the terminal is assigned to it right
// away; whether that stand takes cards (card_enabled) stays with the admins.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, ['cash_register.manage', 'cash_register.guest_manage'])
  if (!current.ok) return current
  if (!isCardConfigured()) return { ok: false, error: CARD_NOT_CONFIGURED_ERROR }

  const body = await readBody(event)
  const name = parseReaderName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  const code = typeof body?.pairing_code === 'string' ? body.pairing_code.replace(/[\s-]/g, '').toUpperCase() : ''
  if (!PAIRING_CODE.test(code)) return { ok: false, error: 'Ungültiger Kopplungscode' }

  const isAdmin = hasPermission(current.user, 'cash_register.manage')
  const standId = body?.stand_id == null || body.stand_id === '' ? null : Number(body.stand_id)
  if (standId === null && !isAdmin) return { ok: false, error: 'Bitte einen Stand wählen' }
  if (standId !== null) {
    if (!Number.isInteger(standId) || standId <= 0) return { ok: false, error: 'Ungültiger Stand' }
    if (!isAdmin && !(await getOwnedStandIds(current.user)).includes(standId)) return { ok: false, error: 'Nicht berechtigt' }
  }

  const paired = await sumup().pairReader(code, name)
  if (!paired.ok) return { ok: false, error: paired.error }

  try {
    const id = await withTransaction(async (conn) => {
      const result: any = await query(
        `INSERT INTO card_readers (sumup_reader_id, name, device_serial, device_model, pairing_status, paired_by_affiliation_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [paired.reader.id, name, paired.reader.serial, paired.reader.model, paired.reader.status, getActorScope(current.user)],
        conn,
      )
      const readerId = Number(result.insertId)
      if (standId !== null) await query(`UPDATE stands SET card_reader_id = ? WHERE id = ?`, [readerId, standId], conn)
      return readerId
    })
    return { ok: true, id, pairing_status: paired.reader.status }
  } catch (error) {
    if (isDuplicateEntryError(error)) return { ok: false, error: 'Dieses Terminal ist bereits gekoppelt' }
    throw error
  }
})
