import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { getCashRegisterEventById } from '~/server/utils/events'
import { requireAffiliationAdmin } from '~/server/utils/affiliations'
import { normalizeItemIds } from '~/server/utils/stands'

export default defineEventHandler(async (event) => {
  const current = await requireAffiliationAdmin(event)
  if (!current.ok) return current

  const body = await readBody(event)
  const eventId = Number(body?.id)
  if (!Number.isInteger(eventId) || eventId <= 0) return { ok: false, error: 'Ungültige ID' }
  if (!await getCashRegisterEventById(eventId)) return { ok: false, error: 'Veranstaltung nicht gefunden' }

  if (!Array.isArray(body?.affiliations)) return { ok: false, error: 'Ungültige Zugehörigkeiten' }

  const entries = new Map<number, number[]>()
  for (const raw of body.affiliations) {
    const affiliationId = Number(raw?.affiliation_id)
    if (!Number.isInteger(affiliationId) || affiliationId <= 0) return { ok: false, error: 'Ungültige Zugehörigkeiten' }
    if (entries.has(affiliationId)) return { ok: false, error: 'Zugehörigkeit doppelt ausgewählt' }

    const standIds = normalizeItemIds(raw?.stand_ids ?? [])
    if (!standIds) return { ok: false, error: 'Ungültiger Stand' }

    entries.set(affiliationId, standIds)
  }

  const affiliationIds = [...entries.keys()]
  if (affiliationIds.length) {
    const rows = await query<any[]>(
      `SELECT COUNT(*) AS count FROM affiliations WHERE id IN (${affiliationIds.map(() => '?').join(', ')})`,
      affiliationIds,
    )
    if (Number(rows[0]?.count ?? 0) !== affiliationIds.length) return { ok: false, error: 'Zugehörigkeit nicht gefunden' }
  }

  const standIds = [...new Set([...entries.values()].flat())]
  if (standIds.length) {
    const rows = await query<any[]>(
      `SELECT COUNT(*) AS count FROM stands WHERE id IN (${standIds.map(() => '?').join(', ')})`,
      standIds,
    )
    if (Number(rows[0]?.count ?? 0) !== standIds.length) return { ok: false, error: 'Stand nicht gefunden' }
  }

  await withTransaction(async (conn) => {
    // Cascades to event_affiliation_stands.
    await query(`DELETE FROM event_affiliations WHERE event_id = ?`, [eventId], conn)
    for (const [affiliationId, affiliationStandIds] of entries) {
      await query(`INSERT INTO event_affiliations (event_id, affiliation_id) VALUES (?, ?)`, [eventId, affiliationId], conn)
      for (const standId of affiliationStandIds) {
        await query(
          `INSERT INTO event_affiliation_stands (event_id, affiliation_id, stand_id) VALUES (?, ?, ?)`,
          [eventId, affiliationId, standId],
          conn,
        )
      }
    }
  })

  return { ok: true }
})
