import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { isDuplicateEntryError } from '~/server/utils/checkout'
import { itemsExist, normalizeItemIds, parseStandName } from '~/server/utils/stands'
import { replaceGroupItems } from '~/server/utils/itemGroups'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const name = parseStandName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  const itemIds = normalizeItemIds(body?.item_ids ?? [])
  if (!itemIds) return { ok: false, error: 'Ungültige Artikelauswahl' }
  if (!await itemsExist(itemIds)) return { ok: false, error: 'Unbekannter Artikel in der Auswahl' }

  const isActive = body?.is_active === undefined ? 1 : (body.is_active ? 1 : 0)

  try {
    const id = await withTransaction(async (conn) => {
      const result: any = await query(`INSERT INTO item_groups (name, is_active) VALUES (?, ?)`, [name, isActive], conn)
      const groupId = Number(result.insertId)
      await replaceGroupItems(groupId, itemIds, conn)
      return groupId
    })

    return { ok: true, id }
  } catch (err) {
    if (isDuplicateEntryError(err)) return { ok: false, error: 'Eine Artikelgruppe mit diesem Namen existiert bereits' }
    throw err
  }
})
