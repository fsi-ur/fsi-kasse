import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id } = await readBody(event)
  if (!id) return { ok: false, error: 'Missing ID' }

  // Deleting would drop the link between the order line and the item (the line
  // itself survives via its snapshot). Refuse instead — deactivating keeps the
  // item out of the checkout without touching the statistics.
  const usageRows = await query<Array<{ count: unknown }>>(
    `SELECT COUNT(*) AS count FROM order_items WHERE item_id = ?`,
    [id],
  )

  if (Number(usageRows[0]?.count ?? 0) > 0) {
    return { ok: false, error: 'Item is used by existing orders', code: 'item_in_use' }
  }

  await query(`DELETE FROM items WHERE id = ?`, [id])
  return { ok: true }
})
