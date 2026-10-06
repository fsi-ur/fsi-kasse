import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { hasPermission, requirePermission } from '~/server/utils/api/guards'
import { getOwnedStandIds } from '~/server/utils/stands'
import { normalizeBigInt } from '~/server/utils/normalize'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const { name, price, deposit = 0, image, is_active = 1, stand_id } = await readBody(event)

  // Guest managers create items only for one of their stands, linked in the
  // same transaction so the new item is theirs to edit from the start.
  let guestStandId: number | null = null
  if (!hasPermission(current.user, 'cash_register.manage')) {
    guestStandId = Number(stand_id)
    if (!(await getOwnedStandIds(current.user)).includes(guestStandId)) return { ok: false, error: 'Stand nicht gefunden' }
  }

  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName || trimmedName.length > 255) return { ok: false, error: 'Missing or invalid name' }

  // An explicit numeric check, so a legitimate price of 0 (free item) works.
  const parsedPrice = Number(price)
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return { ok: false, error: 'Invalid price' }

  const parsedDeposit = Number(deposit ?? 0)
  if (!Number.isFinite(parsedDeposit) || parsedDeposit < 0) return { ok: false, error: 'Invalid deposit' }

  const roundedPrice = Math.round(parsedPrice * 100) / 100
  const roundedDeposit = Math.round(parsedDeposit * 100) / 100

  const itemId = await withTransaction(async (conn) => {
    const result = await query(
      `INSERT INTO items (name, price, deposit, image, is_active) VALUES (?, ?, ?, ?, ?)`,
      [trimmedName, roundedPrice, roundedDeposit, image ?? null, is_active ? 1 : 0],
      conn,
    )

    const id = normalizeBigInt((result as any).insertId)

    await query(
      `INSERT INTO item_price_history (item_id, name, price, deposit, changed_by) VALUES (?, ?, ?, ?, ?)`,
      [id, trimmedName, roundedPrice, roundedDeposit, current.user?.username ?? null],
      conn,
    )

    if (guestStandId !== null) {
      await query(`INSERT INTO stand_items (stand_id, item_id) VALUES (?, ?)`, [guestStandId, id], conn)
    }

    return id
  })

  return { ok: true, id: normalizeBigInt(itemId) }
})
