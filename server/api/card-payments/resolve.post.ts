import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeClientUuid } from '~/server/utils/checkout'
import { loadCardPayment, STALE_AFTER_SECONDS } from '~/server/utils/cardPayments'

const MAX_NOTE_LENGTH = 1000

// Closes a payment an admin settled by hand ("Erstattet im SumUp-Dashboard",
// "Manuell bar nachgebucht", …). Only booking_failed and stuck payments; the
// note is mandatory.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const clientUuid = normalizeClientUuid(body?.client_uuid)
  if (!clientUuid) return { ok: false, error: 'Missing or invalid client_uuid' }

  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!note) return { ok: false, error: 'Bitte eine Notiz angeben' }
  if (note.length > MAX_NOTE_LENGTH) return { ok: false, error: 'Notiz ist zu lang' }

  return withTransaction(async (conn) => {
    const row = await loadCardPayment(clientUuid, conn, true)
    if (!row) return { ok: false as const, error: 'Kartenzahlung nicht gefunden' }

    const stale = (row.status === 'created' || row.status === 'processing') && Number(row.age_seconds) > STALE_AFTER_SECONDS
    if (row.status !== 'booking_failed' && !stale) {
      return { ok: false as const, error: 'Nur fehlgeschlagene Buchungen oder hängende Zahlungen können erledigt werden' }
    }

    await query(
      `UPDATE card_payments
       SET status = 'resolved', resolution_note = ?, resolved_by = ?, finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [note, current.user.username, row.id],
      conn,
    )
    return { ok: true as const }
  })
})
