import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getOwnedItemIds, getOwnedStandIds, listStands } from '~/server/utils/stands'
import { getActorScope } from '~/server/utils/affiliations'

// The stands a guest manager's affiliation runs, plus every item (for the
// assortment picker) flagged with whether they may edit it.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const standIds = await getOwnedStandIds(current.user)
  const editableIds = new Set(await getOwnedItemIds(standIds))

  const eventRows = standIds.length
    ? await query<any[]>(
        `SELECT eas.stand_id, e.name
         FROM event_affiliation_stands eas
         JOIN events e ON e.id = eas.event_id
         WHERE eas.affiliation_id = ? AND e.is_active = 1 AND eas.stand_id IN (${standIds.map(() => '?').join(', ')})
         ORDER BY e.starts_at DESC`,
        [getActorScope(current.user), ...standIds],
      )
    : []

  const eventNamesByStand = new Map<number, string[]>()
  for (const row of eventRows) {
    const standId = Number(row.stand_id)
    if (!eventNamesByStand.has(standId)) eventNamesByStand.set(standId, [])
    eventNamesByStand.get(standId)!.push(String(row.name))
  }

  const stands = (await listStands())
    .filter(stand => standIds.includes(stand.id))
    .map(stand => ({ ...stand, event_names: eventNamesByStand.get(stand.id) ?? [] }))

  const items = normalizeBigInt(await query<any[]>(
    `SELECT id, name, price, deposit, is_active FROM items ORDER BY name ASC`,
  )).map((item: any) => ({ ...item, editable: editableIds.has(Number(item.id)) }))

  return { ok: true, stands, items }
})
