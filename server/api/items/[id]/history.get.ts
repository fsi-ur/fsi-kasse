import { defineEventHandler, getRouterParam } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const itemId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: 'Invalid item id' }
  }

  const rows = normalizeBigInt(await query(`
    SELECT name, price, deposit, changed_by, valid_from
    FROM item_price_history
    WHERE item_id = ?
    ORDER BY valid_from DESC, id DESC
  `, [itemId]))

  return { ok: true, history: rows }
})
