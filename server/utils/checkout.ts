import { query } from '~/server/utils/db'
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

export interface BookedLine {
  item_id: number
  name: string
  quantity: number
  unit_price: number
  unit_deposit: number
  line_total: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** Returns the lower-cased UUID, or null when the value is not a UUID. */
export function normalizeClientUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return null
  return value.toLowerCase()
}

/** A concurrent replay of the same client_uuid lost the race on the unique key. */
export function isDuplicateEntryError(error: unknown) {
  const code = (error as any)?.code
  const errno = Number((error as any)?.errno)
  return code === 'ER_DUP_ENTRY' || errno === 1062
}

export interface RequestedLine {
  quantity: number
  unit_price: number | null
  unit_deposit: number | null
}

function parseAmount(value: unknown): number | null | undefined {
  if (value == null) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return round2(amount)
}

// Normalises the request lines: positive integer id/quantity, duplicates merged.
// An empty (or missing) list comes back as an empty map
export function normalizeLines(items: unknown): Map<number, RequestedLine> | null {
  if (items == null) return new Map()
  if (!Array.isArray(items)) return null

  const merged = new Map<number, RequestedLine>()

  for (const entry of items) {
    const id = Number((entry as any)?.id)
    const quantity = Number((entry as any)?.quantity)
    const unitPrice = parseAmount((entry as any)?.unit_price)
    const unitDeposit = parseAmount((entry as any)?.unit_deposit)

    if (!Number.isInteger(id) || id <= 0) return null
    if (!Number.isInteger(quantity) || quantity <= 0) return null
    if (unitPrice === undefined || unitDeposit === undefined) return null
    // Price and deposit are one charged state of the item: both or neither.
    if ((unitPrice === null) !== (unitDeposit === null)) return null

    const existing = merged.get(id)
    if (existing) {
      if (existing.unit_price !== unitPrice || existing.unit_deposit !== unitDeposit) return null
      existing.quantity += quantity
    } else {
      merged.set(id, { quantity, unit_price: unitPrice, unit_deposit: unitDeposit })
    }
  }

  return merged
}

function toCents(amount: unknown) {
  return Math.round(Number(amount ?? 0) * 100)
}

function priceKey(price: unknown, deposit: unknown) {
  return `${toCents(price)}|${toCents(deposit)}`
}

export async function validateCashierAndEvent(cashierId: number, eventId: number) {
  const selectedCashier = await getCashRegisterCashierById(cashierId)
  if (!selectedCashier) {
    return { ok: false as const, error: 'Selected cashier does not exist' }
  }
  if (!selectedCashier.is_active) {
    return { ok: false as const, error: 'Selected cashier is not active' }
  }

  const selectedEvent = await getCashRegisterEventById(eventId)
  if (!selectedEvent) {
    return { ok: false as const, error: 'Selected event does not exist' }
  }
  if (!selectedEvent.is_active) {
    return { ok: false as const, error: 'Selected event is not active' }
  }

  return null
}

export async function resolveBookedLines(lines: Map<number, RequestedLine>) {
  const ids = [...lines.keys()]
  if (!ids.length) return { ok: true as const, booked: [] as BookedLine[] }

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
    if (!row) return { ok: false as const, error: 'Unknown item in order' }
    if (!row.is_active) return { ok: false as const, error: `Item "${row.name}" is not active` }
  }

  const pricedIds = ids.filter(id => lines.get(id)!.unit_price !== null)
  const knownPrices = new Map<number, Set<string>>()
  for (const id of pricedIds) {
    const row = itemsById.get(id)!
    knownPrices.set(id, new Set([priceKey(row.price, row.deposit)]))
  }

  if (pricedIds.length) {
    const historyRows = normalizeBigInt(await query<Array<{ item_id: number, price: string | number, deposit: string | number }>>(
      `SELECT item_id, price, deposit
       FROM item_price_history
       WHERE item_id IN (${pricedIds.map(() => '?').join(', ')})`,
      pricedIds,
    )) as Array<{ item_id: number, price: string | number, deposit: string | number }>

    for (const history of historyRows) {
      knownPrices.get(Number(history.item_id))?.add(priceKey(history.price, history.deposit))
    }

    for (const id of pricedIds) {
      const line = lines.get(id)!
      if (!knownPrices.get(id)!.has(priceKey(line.unit_price, line.unit_deposit))) {
        return { ok: false as const, error: `Price of item "${itemsById.get(id)!.name}" does not match any known price` }
      }
    }
  }

  const booked: BookedLine[] = ids.map((id) => {
    const row = itemsById.get(id)!
    const line = lines.get(id)!
    const quantity = line.quantity
    const unitPrice = line.unit_price ?? Number(row.price)
    const unitDeposit = line.unit_deposit ?? Number(row.deposit ?? 0)

    return {
      item_id: id,
      name: String(row.name),
      quantity,
      unit_price: unitPrice,
      unit_deposit: unitDeposit,
      line_total: round2(quantity * (unitPrice + unitDeposit)),
    }
  })

  return { ok: true as const, booked }
}

export function bookedTotal(booked: BookedLine[], isFachschaft: boolean) {
  if (isFachschaft) return 0
  return round2(booked.reduce((sum, line) => sum + line.line_total, 0))
}

/**
 * Rebuilds the response of an already committed checkout from its stored
 * snapshot columns (never from `items.price`), so a replayed request gets the
 * same answer the lost original would have returned.
 */
export async function findCommittedCheckout(clientUuid: string) {
  const orders = await query<Array<{ id: number, fachschaft: number }>>(
    `SELECT id, fachschaft FROM orders WHERE client_uuid = ? LIMIT 1`,
    [clientUuid],
  )
  const order = orders[0]

  const donations = await query<Array<{ amount: string | number }>>(
    `SELECT amount FROM donations WHERE client_uuid = ? LIMIT 1`,
    [clientUuid],
  )
  const donation = donations[0]

  if (!order && !donation) return null

  let lines: BookedLine[] = []
  if (order) {
    const rows = await query<Array<{
      item_id: number | null
      item_name: string
      quantity: number
      unit_price: string | number
      unit_deposit: string | number
    }>>(
      `SELECT item_id, item_name, quantity, unit_price, unit_deposit
       FROM order_items
       WHERE order_id = ?
       ORDER BY id`,
      [order.id],
    )

    lines = rows.map(row => ({
      item_id: Number(row.item_id),
      name: String(row.item_name),
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
      unit_deposit: Number(row.unit_deposit),
      line_total: round2(Number(row.quantity) * (Number(row.unit_price) + Number(row.unit_deposit))),
    }))
  }

  return {
    ok: true as const,
    duplicate: true,
    order_id: order ? Number(order.id) : null,
    total: order ? bookedTotal(lines, Boolean(order.fachschaft)) : 0,
    lines,
    donation_amount: donation ? Number(donation.amount) : 0,
  }
}
