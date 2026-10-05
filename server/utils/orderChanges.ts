import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getCashRegisterEvents } from '~/server/utils/events'
import { round2 } from '~/server/utils/checkout'

export type OrderChangeStatus = 'pending' | 'approved' | 'rejected'

export const MAX_CHANGE_TEXT_LENGTH = 1000

export interface OrderLineRow {
  id: number
  item_id: number | null
  item_name: string
  quantity: number
  unit_price: string | number
  unit_deposit: string | number
}

export interface OrderChangeLine {
  id: number
  order_item_id: number | null
  item_id: number | null
  name: string
  quantity: number
  price: number
  deposit: number
}

export interface OrderChangeSide {
  fachschaft: boolean
  lines: OrderChangeLine[]
  total: number
}

export interface OrderChangeRequest {
  id: number
  order_id: number
  event_id: number
  event_name: string | null
  cashier: string | null
  requested_by: string | null
  status: OrderChangeStatus
  reason: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  original: OrderChangeSide
  proposed: OrderChangeSide
}

export function parseChangeText(value: unknown): string | null | undefined {
  if (value == null) return null
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length > MAX_CHANGE_TEXT_LENGTH) return undefined
  return text || null
}

export async function loadOrderLines(orderId: number, conn?: mariadb.PoolConnection): Promise<OrderLineRow[]> {
  return normalizeBigInt(await query<OrderLineRow[]>(
    `SELECT id, item_id, item_name, quantity, unit_price, unit_deposit
     FROM order_items
     WHERE order_id = ?
     ORDER BY id`,
    [orderId],
    conn,
  ))
}

function cents(amount: unknown) {
  return Math.round(Number(amount ?? 0) * 100)
}

export function orderMatchesSnapshot(
  current: { fachschaft: boolean, lines: OrderLineRow[] },
  snapshot: { fachschaft: boolean, lines: Array<{ order_item_id: number | null, quantity: number, unit_price: unknown, unit_deposit: unknown }> },
) {
  if (current.fachschaft !== snapshot.fachschaft) return false
  if (current.lines.length !== snapshot.lines.length) return false

  const key = (id: unknown, quantity: unknown, price: unknown, deposit: unknown) =>
    `${Number(id)}|${Number(quantity)}|${cents(price)}|${cents(deposit)}`

  const currentKeys = new Set(current.lines.map(line => key(line.id, line.quantity, line.unit_price, line.unit_deposit)))
  return snapshot.lines.every(line => currentKeys.has(key(line.order_item_id, line.quantity, line.unit_price, line.unit_deposit)))
}

function sideTotal(fachschaft: boolean, lines: OrderChangeLine[]) {
  if (fachschaft) return 0
  return round2(lines.reduce((sum, line) => sum + line.quantity * (line.price + line.deposit), 0))
}

interface RequestRow {
  id: number
  order_id: number
  event_id: number
  cashier_name: string | null
  requested_by: string | null
  status: OrderChangeStatus
  reason: string | null
  original_fachschaft: number
  proposed_fachschaft: number
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
}

interface RequestLineRow {
  id: number
  request_id: number
  version: 'original' | 'proposed'
  order_item_id: number | null
  item_id: number | null
  item_name: string
  quantity: number
  unit_price: string | number
  unit_deposit: string | number
}

export async function loadChangeRequests(
  filter: { eventId?: number, status?: OrderChangeStatus } = {},
  withEventNames = true,
): Promise<OrderChangeRequest[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (filter.eventId) {
    conditions.push('r.event_id = ?')
    params.push(filter.eventId)
  }
  if (filter.status) {
    conditions.push('r.status = ?')
    params.push(filter.status)
  }

  const rows: RequestRow[] = normalizeBigInt(await query<RequestRow[]>(
    `SELECT
       r.id, r.order_id, r.event_id, c.name AS cashier_name, r.requested_by, r.status, r.reason,
       r.original_fachschaft, r.proposed_fachschaft, r.created_at, r.reviewed_by, r.reviewed_at, r.review_note
     FROM order_change_requests r
     LEFT JOIN cashiers c ON c.id = r.cashier_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY r.status = 'pending' DESC, r.created_at DESC, r.id DESC`,
    params,
  ))
  if (!rows.length) return []

  const ids = rows.map(row => Number(row.id))
  const lineRows: RequestLineRow[] = normalizeBigInt(await query<RequestLineRow[]>(
    `SELECT id, request_id, version, order_item_id, item_id, item_name, quantity, unit_price, unit_deposit
     FROM order_change_request_lines
     WHERE request_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY id`,
    ids,
  ))

  const linesByRequest = new Map<number, { original: OrderChangeLine[], proposed: OrderChangeLine[] }>()
  for (const row of lineRows) {
    let entry = linesByRequest.get(Number(row.request_id))
    if (!entry) {
      entry = { original: [], proposed: [] }
      linesByRequest.set(Number(row.request_id), entry)
    }
    entry[row.version].push({
      id: Number(row.id),
      order_item_id: row.order_item_id == null ? null : Number(row.order_item_id),
      item_id: row.item_id == null ? null : Number(row.item_id),
      name: String(row.item_name),
      quantity: Number(row.quantity),
      price: Number(row.unit_price),
      deposit: Number(row.unit_deposit),
    })
  }

  const eventNames = new Map(withEventNames ? (await getCashRegisterEvents()).map(entry => [entry.id, entry.name]) : [])

  return rows.map((row) => {
    const lines = linesByRequest.get(Number(row.id)) ?? { original: [], proposed: [] }
    const originalFachschaft = Boolean(row.original_fachschaft)
    const proposedFachschaft = Boolean(row.proposed_fachschaft)

    return {
      id: Number(row.id),
      order_id: Number(row.order_id),
      event_id: Number(row.event_id),
      event_name: eventNames.get(Number(row.event_id)) ?? null,
      cashier: row.cashier_name,
      requested_by: row.requested_by,
      status: row.status,
      reason: row.reason,
      created_at: row.created_at,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      review_note: row.review_note,
      original: { fachschaft: originalFachschaft, lines: lines.original, total: sideTotal(originalFachschaft, lines.original) },
      proposed: { fachschaft: proposedFachschaft, lines: lines.proposed, total: sideTotal(proposedFachschaft, lines.proposed) },
    }
  })
}
