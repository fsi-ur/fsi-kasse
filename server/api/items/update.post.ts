import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'

interface ItemRow {
  id: number
  name: string
  price: string | number
  deposit: string | number | null
}

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id, name, price, deposit = 0 } = await readBody(event)

  const itemId = Number(id)
  if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, error: 'Missing or invalid ID' }

  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName || trimmedName.length > 255) return { ok: false, error: 'Missing or invalid name' }

  const parsedPrice = Number(price)
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return { ok: false, error: 'Invalid price' }

  const parsedDeposit = Number(deposit ?? 0)
  if (!Number.isFinite(parsedDeposit) || parsedDeposit < 0) return { ok: false, error: 'Invalid deposit' }

  const roundedPrice = Math.round(parsedPrice * 100) / 100
  const roundedDeposit = Math.round(parsedDeposit * 100) / 100

  const rows = normalizeBigInt(await query<ItemRow[]>(
    `SELECT id, name, price, deposit FROM items WHERE id = ? LIMIT 1`,
    [itemId],
  ))

  const existing = rows[0]
  if (!existing) return { ok: false, error: 'Item does not exist' }

  const changed = String(existing.name) !== trimmedName
    || Number(existing.price) !== roundedPrice
    || Number(existing.deposit ?? 0) !== roundedDeposit

  // Existing order_items are deliberately left untouched: they carry their own
  // price/name snapshot, which is what keeps past events correctly valued.
  await withTransaction(async (conn) => {
    await query(
      `UPDATE items SET name = ?, price = ?, deposit = ? WHERE id = ?`,
      [trimmedName, roundedPrice, roundedDeposit, itemId],
      conn,
    )

    if (changed) {
      await query(
        `INSERT INTO item_price_history (item_id, name, price, deposit, changed_by) VALUES (?, ?, ?, ?, ?)`,
        [itemId, trimmedName, roundedPrice, roundedDeposit, current.user?.username ?? null],
        conn,
      )
    }
  })

  return { ok: true, changed }
})
