import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { isDuplicateEntryError } from '~/server/utils/checkout'
import { itemsExist, normalizeItemIds, parseStandName, replaceStandItems } from '~/server/utils/stands'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const name = parseStandName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  const itemIds = normalizeItemIds(body?.item_ids ?? [])
  if (!itemIds) return { ok: false, error: 'Ungültige Artikelauswahl' }
  if (!await itemsExist(itemIds)) return { ok: false, error: 'Unbekannter Artikel in der Auswahl' }

  const existing = await query<Array<{ id: unknown }>>(`SELECT id FROM stands WHERE id = ? LIMIT 1`, [id])
  if (!existing[0]) return { ok: false, error: 'Stand nicht gefunden' }

  try {
    await withTransaction(async (conn) => {
      await query(`UPDATE stands SET name = ? WHERE id = ?`, [name, id], conn)
      await replaceStandItems(id, itemIds, conn)
    })
  } catch (err) {
    if (isDuplicateEntryError(err)) return { ok: false, error: 'Ein Stand mit diesem Namen existiert bereits' }
    throw err
  }

  return { ok: true }
})
