import type * as mariadb from 'mariadb'
import type { User } from '~/types/user'
import { query } from '~/server/utils/db'
import { getActorScope } from '~/server/utils/affiliations'

export interface Stand {
  id: number
  name: string
  is_active: boolean
  item_ids: number[]
}

export async function listStands(): Promise<Stand[]> {
  const rows = await query<Array<{ id: unknown, name: unknown, is_active: unknown }>>(
    `SELECT id, name, is_active FROM stands ORDER BY name ASC`,
  )
  const links = await query<Array<{ stand_id: unknown, item_id: unknown }>>(
    `SELECT stand_id, item_id FROM stand_items ORDER BY item_id ASC`,
  )

  const itemIdsByStand = new Map<number, number[]>()
  for (const link of links) {
    const standId = Number(link.stand_id)
    if (!itemIdsByStand.has(standId)) itemIdsByStand.set(standId, [])
    itemIdsByStand.get(standId)!.push(Number(link.item_id))
  }

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    is_active: Number(row.is_active) === 1,
    item_ids: itemIdsByStand.get(Number(row.id)) ?? [],
  }))
}

export async function resolveStandId(value: unknown): Promise<number | null> {
  if (value == null || value === '') return null
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null

  const rows = await query<Array<{ id: unknown }>>(`SELECT id FROM stands WHERE id = ? LIMIT 1`, [id])
  return rows[0] ? id : null
}

export function parseStandName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 255) return null
  return name
}

export function normalizeItemIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null

  const ids = new Set<number>()
  for (const entry of value) {
    const id = Number(entry)
    if (!Number.isInteger(id) || id <= 0) return null
    ids.add(id)
  }

  return [...ids]
}

export async function itemsExist(itemIds: number[]) {
  if (!itemIds.length) return true

  const rows = await query<Array<{ count: unknown }>>(
    `SELECT COUNT(*) AS count FROM items WHERE id IN (${itemIds.map(() => '?').join(', ')})`,
    itemIds,
  )
  return Number(rows[0]?.count ?? 0) === itemIds.length
}

export async function replaceStandItems(standId: number, itemIds: number[], conn: mariadb.PoolConnection) {
  await query(`DELETE FROM stand_items WHERE stand_id = ?`, [standId], conn)
  for (const itemId of itemIds) {
    await query(`INSERT INTO stand_items (stand_id, item_id) VALUES (?, ?)`, [standId, itemId], conn)
  }
}

/** Stands the actor's affiliation runs at an active event. Only scoped guests own stands. */
export async function getOwnedStandIds(actor: User): Promise<number[]> {
  const scope = getActorScope(actor)
  if (scope == null) return []

  const rows = await query<Array<{ stand_id: unknown }>>(
    `SELECT DISTINCT eas.stand_id
     FROM event_affiliation_stands eas
     JOIN events e ON e.id = eas.event_id
     WHERE eas.affiliation_id = ? AND e.is_active = 1`,
    [scope],
  )
  return rows.map(row => Number(row.stand_id))
}

/**
 * Items the owner of `standIds` may edit: sold at one of those stands and at
 * no other, so a price change never reaches another affiliation's stand.
 */
export async function getOwnedItemIds(standIds: number[]): Promise<number[]> {
  if (!standIds.length) return []

  const placeholders = standIds.map(() => '?').join(', ')
  const rows = await query<Array<{ item_id: unknown }>>(
    `SELECT item_id
     FROM stand_items
     GROUP BY item_id
     HAVING SUM(stand_id IN (${placeholders})) > 0
        AND SUM(stand_id NOT IN (${placeholders})) = 0`,
    [...standIds, ...standIds],
  )
  return rows.map(row => Number(row.item_id))
}
