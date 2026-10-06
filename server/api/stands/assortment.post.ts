import { defineEventHandler, readBody } from 'h3'
import { withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { getOwnedStandIds, itemsExist, normalizeItemIds, replaceStandItems } from '~/server/utils/stands'

// A guest manager picks which items their stand sells. Name and activation
// stay with admins (stands/update).
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }
  if (!(await getOwnedStandIds(current.user)).includes(id)) return { ok: false, error: 'Stand nicht gefunden' }

  const itemIds = normalizeItemIds(body?.item_ids ?? [])
  if (!itemIds) return { ok: false, error: 'Ungültige Artikelauswahl' }
  if (!await itemsExist(itemIds)) return { ok: false, error: 'Unbekannter Artikel in der Auswahl' }

  await withTransaction(async (conn) => {
    await replaceStandItems(id, itemIds, conn)
  })

  return { ok: true }
})
