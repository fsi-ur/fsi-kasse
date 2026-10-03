import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'

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
