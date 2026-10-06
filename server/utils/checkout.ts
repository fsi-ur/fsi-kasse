import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterCashierById } from '~/server/utils/cashiers'
import { getCashRegisterEventById } from '~/server/utils/events'
import { canAccessEvent, canCashierWorkEvent } from '~/server/utils/affiliations'
import type { User } from '~/types/user'
import { normalizeVoucherCode } from '~/utils/voucherCode'

interface ItemRow {
  id: number
  name: string
  price: string | number
  deposit: string | number | null
  is_active: number
}

export type LineKind = 'item' | 'voucher_redemption' | 'voucher_sale'

export interface BookedLine {
  /** null for voucher sales (and for lines of deleted items). */
  item_id: number | null
  name: string
  quantity: number
  /** For redemptions the item's real price — its worth, not what the customer paid. */
  unit_price: number
  unit_deposit: number
  line_kind: LineKind
  voucher_id: number | null
  voucher_code: string | null
  voucher_covers_deposit: boolean
  /** The cash the customer pays for the line (see lineCashTotal). */
  line_total: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * The cash a customer pays for an order line. A redeemed line is covered by
 * the voucher — only its deposit is paid, unless the voucher covers that too.
 * Every total (checkout, history, change requests, overview) goes through this,
 * its SQL twin cashAmountSql, or the client twin in utils/lineTotal.ts.
 */
export function lineCashTotal(line: {
  line_kind?: string | null
  quantity: unknown
  unit_price: unknown
  unit_deposit: unknown
  voucher_covers_deposit?: unknown
}) {
  const quantity = Number(line.quantity)
  if (line.line_kind === 'voucher_redemption') {
    return Number(line.voucher_covers_deposit) ? 0 : round2(quantity * Number(line.unit_deposit))
  }
  return round2(quantity * (Number(line.unit_price) + Number(line.unit_deposit)))
}

/** SQL twin of lineCashTotal for an order_items row aliased `alias`. */
export function cashAmountSql(alias = 'oi') {
  return `(${alias}.quantity * CASE ${alias}.line_kind
    WHEN 'voucher_redemption' THEN IF(${alias}.voucher_covers_deposit = 1, 0, ${alias}.unit_deposit)
    ELSE ${alias}.unit_price + ${alias}.unit_deposit END)`
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
  item_id: number
  /** Set for a voucher redemption: the item is paid with this voucher. */
  voucher_code: string | null
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
// Lines are keyed by item and voucher — the same item can be a paid line and
// be redeemed with several vouchers in one order. An empty (or missing) list
// comes back empty
export function normalizeLines(items: unknown): RequestedLine[] | null {
  if (items == null) return []
  if (!Array.isArray(items)) return null

  const merged = new Map<string, RequestedLine>()

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

    let voucherCode: string | null = null
    const rawCode = (entry as any)?.voucher_code
    if (rawCode != null && rawCode !== '') {
      const normalized = normalizeVoucherCode(rawCode)
      if (!normalized.ok) return null
      voucherCode = normalized.code
    }

    const key = `${id}|${voucherCode ?? ''}`
    const existing = merged.get(key)
    if (existing) {
      if (existing.unit_price !== unitPrice || existing.unit_deposit !== unitDeposit) return null
      existing.quantity += quantity
    } else {
      merged.set(key, { item_id: id, voucher_code: voucherCode, quantity, unit_price: unitPrice, unit_deposit: unitDeposit })
    }
  }

  return [...merged.values()]
}

function toCents(amount: unknown) {
  return Math.round(Number(amount ?? 0) * 100)
}

function priceKey(price: unknown, deposit: unknown) {
  return `${toCents(price)}|${toCents(deposit)}`
}

export async function validateCashierAndEvent(actor: User, cashierId: number, eventId: number) {
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

  const blocked = await validateEventAccess(actor, selectedCashier, eventId)
  if (blocked) return blocked

  return null
}

/** The event allowlist: a scoped guest and an affiliated guest cashier both need their affiliation allowed. */
export async function validateEventAccess(
  actor: User,
  cashier: { is_guest: boolean, affiliation_id: number | null },
  eventId: number,
) {
  if (!await canAccessEvent(actor, eventId)) {
    return { ok: false as const, error: 'Veranstaltung ist für deine Zugehörigkeit nicht freigegeben' }
  }
  if (!await canCashierWorkEvent(cashier, eventId)) {
    return { ok: false as const, error: 'Kassierer ist für diese Veranstaltung nicht freigegeben' }
  }
  return null
}

/**
 * Books the item and redemption lines at the price the cashier charged, if
 * the item ever had that price. Redemption lines come back with
 * `voucher_code` set but without voucher_id / deposit coverage — those are
 * filled in by resolveVoucherLines.
 */
export async function resolveBookedLines(lines: RequestedLine[]) {
  const ids = [...new Set(lines.map(line => line.item_id))]
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

  const pricedIds = [...new Set(lines.filter(line => line.unit_price !== null).map(line => line.item_id))]
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

    for (const line of lines) {
      if (line.unit_price === null) continue
      if (!knownPrices.get(line.item_id)!.has(priceKey(line.unit_price, line.unit_deposit))) {
        return { ok: false as const, error: `Price of item "${itemsById.get(line.item_id)!.name}" does not match any known price` }
      }
    }
  }

  const booked: BookedLine[] = lines.map((line) => {
    const row = itemsById.get(line.item_id)!
    const unitPrice = line.unit_price ?? Number(row.price)
    const unitDeposit = line.unit_deposit ?? Number(row.deposit ?? 0)
    const lineKind: LineKind = line.voucher_code ? 'voucher_redemption' : 'item'

    return {
      item_id: line.item_id,
      name: String(row.name),
      quantity: line.quantity,
      unit_price: unitPrice,
      unit_deposit: unitDeposit,
      line_kind: lineKind,
      voucher_id: null,
      voucher_code: line.voucher_code,
      voucher_covers_deposit: false,
      line_total: lineCashTotal({ line_kind: lineKind, quantity: line.quantity, unit_price: unitPrice, unit_deposit: unitDeposit }),
    }
  })

  return { ok: true as const, booked }
}

export function bookedTotal(booked: BookedLine[], isFachschaft: boolean) {
  if (isFachschaft) return 0
  return round2(booked.reduce((sum, line) => sum + line.line_total, 0))
}

/** Booked lines from stored order_items rows (snapshot columns plus the voucher's code). */
export function bookedLineFromRow(row: {
  item_id: unknown
  item_name: unknown
  quantity: unknown
  unit_price: unknown
  unit_deposit: unknown
  line_kind: unknown
  voucher_id: unknown
  voucher_code: unknown
  voucher_covers_deposit: unknown
}): BookedLine {
  const line = {
    item_id: row.item_id == null ? null : Number(row.item_id),
    name: String(row.item_name),
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    unit_deposit: Number(row.unit_deposit),
    line_kind: (row.line_kind ?? 'item') as LineKind,
    voucher_id: row.voucher_id == null ? null : Number(row.voucher_id),
    voucher_code: row.voucher_code == null ? null : String(row.voucher_code),
    voucher_covers_deposit: Boolean(Number(row.voucher_covers_deposit)),
  }
  return { ...line, line_total: lineCashTotal(line) }
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

  if (!order && !donation) {
    const cancelled = await query<Array<{ id: number }>>(
      `SELECT r.id
       FROM order_change_requests r
       WHERE r.order_client_uuid = ?
         AND r.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM order_change_request_lines l WHERE l.request_id = r.id AND l.version = 'proposed'
         )
       LIMIT 1`,
      [clientUuid],
    )
    if (!cancelled[0]) return null

    return { ok: true as const, duplicate: true, order_id: null, total: 0, lines: [] as BookedLine[], donation_amount: 0 }
  }

  let lines: BookedLine[] = []
  if (order) {
    const rows = await query<any[]>(
      `SELECT oi.item_id, oi.item_name, oi.quantity, oi.unit_price, oi.unit_deposit,
         oi.line_kind, oi.voucher_id, v.code AS voucher_code, oi.voucher_covers_deposit
       FROM order_items oi
       LEFT JOIN vouchers v ON v.id = oi.voucher_id
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [order.id],
    )

    lines = rows.map(bookedLineFromRow)
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
