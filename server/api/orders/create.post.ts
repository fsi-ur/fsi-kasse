import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'

interface ItemRow {
  id: number
  name: string
  price: string | number
  deposit: string | number | null
  is_active: number
}

// Normalises the request lines: positive integer id/quantity, duplicates merged.
function normalizeLines(items: unknown): Map<number, number> | null {
  if (!Array.isArray(items)) return null

  const merged = new Map<number, number>()

  for (const entry of items) {
    const id = Number((entry as any)?.id)
    const quantity = Number((entry as any)?.quantity)

    if (!Number.isInteger(id) || id <= 0) return null
    if (!Number.isInteger(quantity) || quantity <= 0) return null

    merged.set(id, (merged.get(id) ?? 0) + quantity)
  }

  return merged.size > 0 ? merged : null
}

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const { cashier_id, event_id, is_fachschaft = false, items } = await readBody(event)

  if (!cashier_id || !event_id) {
    return { ok: false, error: 'Missing order details' }
  }

  const lines = normalizeLines(items)
  if (!lines) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const selectedCashier = await getCashRegisterCashierById(Number(cashier_id))
  if (!selectedCashier) {
    return { ok: false, error: 'Selected cashier does not exist' }
  }
  if (!selectedCashier.is_active) {
    return { ok: false, error: 'Selected cashier is not active' }
  }

  const selectedEvent = await getCashRegisterEventById(Number(event_id))
  if (!selectedEvent) {
    return { ok: false, error: 'Selected event does not exist' }
  }
  if (!selectedEvent.is_active) {
    return { ok: false, error: 'Selected event is not active' }
  }

  const ids = [...lines.keys()]
  // normalizeBigInt returns `any`, which would otherwise erase ItemRow through
  // the .map() below and leave itemsById typed as Map<number, {}>.
  const itemRows: ItemRow[] = normalizeBigInt(await query<ItemRow[]>(
    `SELECT id, name, price, deposit, is_active
     FROM items
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  ))

  const itemsById = new Map(itemRows.map((row): [number, ItemRow] => [Number(row.id), row]))

  for (const id of ids) {
    const row = itemsById.get(id)
    if (!row) return { ok: false, error: 'Unknown item in order' }
    if (!row.is_active) return { ok: false, error: `Item "${row.name}" is not active` }
  }

  // The snapshot values always come from the DB row — the client cart is stale
  // by construction, so a price in the request body is never trusted.
  const booked = ids.map((id) => {
    const row = itemsById.get(id)!
    const quantity = lines.get(id)!
    const unitPrice = Number(row.price)
    const unitDeposit = Number(row.deposit ?? 0)

    return {
      item_id: id,
      name: String(row.name),
      quantity,
      unit_price: unitPrice,
      unit_deposit: unitDeposit,
      line_total: Math.round(quantity * (unitPrice + unitDeposit) * 100) / 100,
    }
  })

  const isFachschaft = is_fachschaft ? 1 : 0
  const total = isFachschaft
    ? 0
    : Math.round(booked.reduce((sum, line) => sum + line.line_total, 0) * 100) / 100

  const order_id = await withTransaction(async (conn) => {
    const result = await query(
      `INSERT INTO orders (cashier_id, event_id, fachschaft) VALUES (?, ?, ?)`,
      [cashier_id, event_id, isFachschaft],
      conn,
    )

    const orderId = normalizeBigInt((result as any).insertId)

    for (const line of booked) {
      await query(
        `INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, unit_deposit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, line.item_id, line.name, line.quantity, line.unit_price, line.unit_deposit],
        conn,
      )
    }

    return orderId
  })

  return { ok: true, order_id: normalizeBigInt(order_id), total, lines: booked }
})
