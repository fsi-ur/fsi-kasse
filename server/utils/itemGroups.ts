import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'

export interface ItemGroup {
  id: number
  name: string
  is_active: boolean
  item_ids: number[]
  batch_count: number
}

export async function listItemGroups(): Promise<ItemGroup[]> {
  const rows = await query<Array<{ id: unknown, name: unknown, is_active: unknown, batch_count: unknown }>>(
    `SELECT g.id, g.name, g.is_active,
       (SELECT COUNT(*) FROM voucher_batches b WHERE b.item_group_id = g.id) AS batch_count
     FROM item_groups g
     ORDER BY g.name ASC`,
  )
  const links = await query<Array<{ group_id: unknown, item_id: unknown }>>(
    `SELECT group_id, item_id FROM item_group_items ORDER BY item_id ASC`,
  )

  const itemIdsByGroup = new Map<number, number[]>()
  for (const link of links) {
    const groupId = Number(link.group_id)
    if (!itemIdsByGroup.has(groupId)) itemIdsByGroup.set(groupId, [])
    itemIdsByGroup.get(groupId)!.push(Number(link.item_id))
  }

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    is_active: Number(row.is_active) === 1,
    item_ids: itemIdsByGroup.get(Number(row.id)) ?? [],
    batch_count: Number(row.batch_count ?? 0),
  }))
}

/** Current members of an item group — membership is live, so this is read at every use. */
export async function groupItemIds(groupId: number, conn?: mariadb.PoolConnection): Promise<number[]> {
  const rows = await query<Array<{ item_id: unknown }>>(
    `SELECT item_id FROM item_group_items WHERE group_id = ? ORDER BY item_id`,
    [groupId],
    conn,
  )
  return rows.map(row => Number(row.item_id))
}

export async function replaceGroupItems(groupId: number, itemIds: number[], conn: mariadb.PoolConnection) {
  await query(`DELETE FROM item_group_items WHERE group_id = ?`, [groupId], conn)
  for (const itemId of itemIds) {
    await query(`INSERT INTO item_group_items (group_id, item_id) VALUES (?, ?)`, [groupId, itemId], conn)
  }
}
