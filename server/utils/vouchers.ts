import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { lineCashTotal, round2, type BookedLine } from '~/server/utils/checkout'
import { getCashRegisterEventById } from '~/server/utils/events'
import { groupItemIds } from '~/server/utils/itemGroups'
import { normalizeHexColor } from '~/utils/voucherColors'
import { formatVoucherCode, normalizeVoucherCode } from '~/utils/voucherCode'

export type VoucherStatus = 'unsold' | 'active' | 'revoked'
export type VoucherBatchKind = 'paid' | 'free'
/** `used_up` is derived (active with no units left), never stored. */
export type VoucherDisplayStatus = VoucherStatus | 'used_up'

export const VOUCHER_STATUSES: VoucherStatus[] = ['unsold', 'active', 'revoked']
export const MAX_UNITS_PER_VOUCHER = 999
export const MAX_BATCH_NOTE_LENGTH = 1000

/** SQL conditions (alias `v`) per display status — constant fragments, never user input. */
export const DISPLAY_STATUS_SQL: Record<VoucherDisplayStatus, string> = {
  unsold: `v.status = 'unsold'`,
  active: `v.status = 'active' AND v.units_remaining > 0`,
  used_up: `v.status = 'active' AND v.units_remaining = 0`,
  revoked: `v.status = 'revoked'`,
}

/** Current Berlin wall-clock time as 'YYYY-MM-DD HH:mm:ss' — `valid_until` is stored in Berlin local time like event dates. */
export function berlinLocalNow(at: Date = new Date()) {
  return at.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })
}

/** A UTC TIMESTAMP string from the pool ('YYYY-MM-DD HH:mm:ss') as Berlin local time. */
export function utcToBerlinLocal(value: string) {
  return berlinLocalNow(new Date(value.replace(' ', 'T') + 'Z'))
}

export function displayStatus(status: VoucherStatus, unitsRemaining: number): VoucherDisplayStatus {
  return status === 'active' && unitsRemaining <= 0 ? 'used_up' : status
}

export function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'charge'
}

export interface VoucherBatchRow {
  id: number
  name: string
  kind: VoucherBatchKind
  item_group_id: number
  item_group_name: string
  units_per_voucher: number
  sale_price: number | null
  includes_deposit: boolean
  event_id: number | null
  event_name: string | null
  valid_until: string | null
  note: string | null
  /** The saved PDF stamper layout (see utils/voucherPdf.ts), null when none was saved. */
  pdf_layout: unknown | null
  created_by: string | null
  created_at: string
}

export interface VoucherBatchSummary extends VoucherBatchRow {
  total: number
  unsold: number
  active: number
  used_up: number
  revoked: number
  units_remaining: number
  units_redeemed: number
  /** At least one voucher of the batch has been sold or redeemed — price and deletion are then locked. */
  in_use: boolean
}

const BATCH_SELECT = `
  SELECT
    b.id, b.name, b.kind, b.item_group_id, g.name AS item_group_name, b.units_per_voucher,
    b.sale_price, b.includes_deposit, b.event_id, e.name AS event_name, b.valid_until, b.note,
    b.pdf_layout, b.created_by, b.created_at
  FROM voucher_batches b
  JOIN item_groups g ON g.id = b.item_group_id
  LEFT JOIN events e ON e.id = b.event_id`

function parseStoredLayout(value: unknown) {
  if (value == null) return null
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function mapBatchRow(row: any): VoucherBatchRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    kind: row.kind,
    item_group_id: Number(row.item_group_id),
    item_group_name: String(row.item_group_name),
    units_per_voucher: Number(row.units_per_voucher),
    sale_price: row.sale_price == null ? null : Number(row.sale_price),
    includes_deposit: Boolean(Number(row.includes_deposit)),
    event_id: row.event_id == null ? null : Number(row.event_id),
    event_name: row.event_name == null ? null : String(row.event_name),
    valid_until: row.valid_until == null ? null : String(row.valid_until),
    note: row.note == null ? null : String(row.note),
    pdf_layout: parseStoredLayout(row.pdf_layout),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at),
  }
}

export async function loadBatch(batchId: number, conn?: mariadb.PoolConnection): Promise<VoucherBatchRow | null> {
  const rows = await query<any[]>(`${BATCH_SELECT} WHERE b.id = ? LIMIT 1`, [batchId], conn)
  return rows[0] ? mapBatchRow(normalizeBigInt(rows[0])) : null
}

export async function listBatchSummaries(): Promise<VoucherBatchSummary[]> {
  const rows: any[] = normalizeBigInt(await query<any[]>(`${BATCH_SELECT} ORDER BY b.created_at DESC, b.id DESC`))
  const counts: any[] = normalizeBigInt(await query<any[]>(
    `SELECT
       batch_id,
       COUNT(*) AS total,
       SUM(status = 'unsold') AS unsold,
       SUM(status = 'active' AND units_remaining > 0) AS active,
       SUM(status = 'active' AND units_remaining = 0) AS used_up,
       SUM(status = 'revoked') AS revoked,
       SUM(IF(status = 'active', units_remaining, 0)) AS units_remaining,
       SUM(units_total - units_remaining) AS units_redeemed,
       SUM(status = 'active' AND sold_order_id IS NOT NULL) AS sold
     FROM vouchers
     GROUP BY batch_id`,
  ))
  const usage: any[] = normalizeBigInt(await query<any[]>(
    `SELECT DISTINCT v.batch_id
     FROM order_items oi
     JOIN vouchers v ON v.id = oi.voucher_id`,
  ))

  const countsByBatch = new Map(counts.map(row => [Number(row.batch_id), row]))
  const usedBatches = new Set(usage.map(row => Number(row.batch_id)))

  return rows.map((row) => {
    const batch = mapBatchRow(row)
    const count = countsByBatch.get(batch.id) ?? {}
    const unitsRedeemed = Number(count.units_redeemed ?? 0)
    return {
      ...batch,
      total: Number(count.total ?? 0),
      unsold: Number(count.unsold ?? 0),
      active: Number(count.active ?? 0),
      used_up: Number(count.used_up ?? 0),
      revoked: Number(count.revoked ?? 0),
      units_remaining: Number(count.units_remaining ?? 0),
      units_redeemed: unitsRedeemed,
      in_use: usedBatches.has(batch.id) || unitsRedeemed > 0 || Number(count.sold ?? 0) > 0,
    }
  })
}

/**
 * Whether any voucher of the batch has been sold or redeemed (or is referenced
 * by a pending change request). Such a batch can't be deleted, and a paid
 * batch's price is then fixed.
 */
export async function batchInUse(batchId: number, conn?: mariadb.PoolConnection) {
  const rows = await query<Array<{ used: unknown }>>(
    `SELECT
       EXISTS (SELECT 1 FROM order_items oi JOIN vouchers v ON v.id = oi.voucher_id WHERE v.batch_id = ?)
       OR EXISTS (
         SELECT 1 FROM order_change_request_lines l
         JOIN order_change_requests r ON r.id = l.request_id
         JOIN vouchers v ON v.id = l.voucher_id
         WHERE v.batch_id = ? AND r.status = 'pending'
       )
       OR EXISTS (
         SELECT 1 FROM vouchers
         WHERE batch_id = ? AND (units_remaining <> units_total OR sold_order_id IS NOT NULL)
       ) AS used`,
    [batchId, batchId, batchId],
    conn,
  )
  return Boolean(Number(rows[0]?.used ?? 0))
}

export interface BatchFieldsInput {
  name?: unknown
  note?: unknown
  event_id?: unknown
  valid_until?: unknown
  sale_price?: unknown
}

export type ParsedBatchFields = {
  name: string
  note: string | null
  event_id: number | null
  valid_until: string | null
}

/** The fields that stay editable after creation. */
export async function parseEditableBatchFields(body: BatchFieldsInput): Promise<{ ok: true, fields: ParsedBatchFields } | { ok: false, error: string }> {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 255) return { ok: false, error: 'Bitte einen Namen eingeben' }

  let note: string | null = null
  if (body.note != null && body.note !== '') {
    if (typeof body.note !== 'string' || body.note.length > MAX_BATCH_NOTE_LENGTH) return { ok: false, error: 'Ungültige Notiz' }
    note = body.note.trim() || null
  }

  let eventId: number | null = null
  if (body.event_id != null && body.event_id !== '') {
    eventId = Number(body.event_id)
    if (!Number.isInteger(eventId) || eventId <= 0 || !(await getCashRegisterEventById(eventId))) {
      return { ok: false, error: 'Veranstaltung nicht gefunden' }
    }
  }

  let validUntil: string | null = null
  if (body.valid_until != null && body.valid_until !== '') {
    // A plain date means "valid through the end of that day" (Berlin time).
    const match = String(body.valid_until).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
    if (!match || !date || date.getUTCDate() !== Number(match[3])) return { ok: false, error: 'Ungültiges Ablaufdatum' }
    validUntil = match[4] != null
      ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] ?? '00'}`
      : `${match[1]}-${match[2]}-${match[3]} 23:59:59`
  }

  return { ok: true, fields: { name, note, event_id: eventId, valid_until: validUntil } }
}

export function parseSalePrice(value: unknown): number | null {
  if (value == null || value === '') return null
  const price = Number(value)
  if (!Number.isFinite(price) || price <= 0 || price > 100000) return null
  return round2(price)
}

/** `status` query param of the exports: comma-separated statuses or 'all'; default = everything but revoked. */
export function parseExportStatuses(value: unknown): VoucherStatus[] | null {
  if (value == null || value === '') return ['unsold', 'active']
  if (value === 'all') return [...VOUCHER_STATUSES]
  const statuses = String(value).split(',').map(entry => entry.trim())
  if (!statuses.length || statuses.some(status => !VOUCHER_STATUSES.includes(status as VoucherStatus))) return null
  return [...new Set(statuses)] as VoucherStatus[]
}

/**
 * The vouchers of a batch in export order. The CSV, the ZIP and the PDF
 * stamper's code list all go through this, so their order can never diverge.
 */
export async function selectExportVouchers(batchId: number, statuses: VoucherStatus[]) {
  const rows = await query<Array<{ id: unknown, code: unknown, status: unknown, units_remaining: unknown }>>(
    `SELECT id, code, status, units_remaining
     FROM vouchers
     WHERE batch_id = ?
       AND status IN (${statuses.map(() => '?').join(', ')})
     ORDER BY id`,
    [batchId, ...statuses],
  )
  return rows.map(row => ({
    id: Number(row.id),
    code: String(row.code),
    status: row.status as VoucherStatus,
    units_remaining: Number(row.units_remaining),
  }))
}

/** QR colour query params of the ZIP export. `background` null = transparent. */
export function parseQrColors(qrColor: unknown, backgroundColor: unknown):
  { ok: true, qr: string, background: string | null } | { ok: false, error: string } {
  const qr = qrColor == null || qrColor === '' ? '#000000' : normalizeHexColor(String(qrColor))
  if (!qr) return { ok: false, error: 'Ungültige QR-Farbe' }

  if (backgroundColor === 'transparent') return { ok: true, qr, background: null }
  const background = backgroundColor == null || backgroundColor === '' ? '#FFFFFF' : normalizeHexColor(String(backgroundColor))
  if (!background) return { ok: false, error: 'Ungültige Hintergrundfarbe' }

  return { ok: true, qr, background }
}

/** A voucher joined with the batch fields that decide what it is worth. */
export interface VoucherWithBatch {
  id: number
  code: string
  status: VoucherStatus
  units_total: number
  units_remaining: number
  sold_order_id: number | null
  sold_at: string | null
  revoked_at: string | null
  revoked_by: string | null
  revoke_reason: string | null
  batch_id: number
  batch_name: string
  kind: VoucherBatchKind
  item_group_id: number
  item_group_name: string
  sale_price: number | null
  includes_deposit: boolean
  event_id: number | null
  event_name: string | null
  valid_until: string | null
  note: string | null
}

const VOUCHER_SELECT = `
  SELECT
    v.id, v.code, v.status, v.units_total, v.units_remaining, v.sold_order_id, v.sold_at,
    v.revoked_at, v.revoked_by, v.revoke_reason,
    b.id AS batch_id, b.name AS batch_name, b.kind, b.item_group_id, g.name AS item_group_name,
    b.sale_price, b.includes_deposit, b.event_id, e.name AS event_name, b.valid_until, b.note
  FROM vouchers v
  JOIN voucher_batches b ON b.id = v.batch_id
  JOIN item_groups g ON g.id = b.item_group_id
  LEFT JOIN events e ON e.id = b.event_id`

function mapVoucherRow(row: any): VoucherWithBatch {
  return {
    id: Number(row.id),
    code: String(row.code),
    status: row.status,
    units_total: Number(row.units_total),
    units_remaining: Number(row.units_remaining),
    sold_order_id: row.sold_order_id == null ? null : Number(row.sold_order_id),
    sold_at: row.sold_at ?? null,
    revoked_at: row.revoked_at ?? null,
    revoked_by: row.revoked_by ?? null,
    revoke_reason: row.revoke_reason ?? null,
    batch_id: Number(row.batch_id),
    batch_name: String(row.batch_name),
    kind: row.kind,
    item_group_id: Number(row.item_group_id),
    item_group_name: String(row.item_group_name),
    sale_price: row.sale_price == null ? null : Number(row.sale_price),
    includes_deposit: Boolean(Number(row.includes_deposit)),
    event_id: row.event_id == null ? null : Number(row.event_id),
    event_name: row.event_name ?? null,
    valid_until: row.valid_until ?? null,
    note: row.note ?? null,
  }
}

export async function loadVoucherByCode(code: string, conn?: mariadb.PoolConnection) {
  const rows = await query<any[]>(`${VOUCHER_SELECT} WHERE v.code = ? LIMIT 1`, [code], conn)
  return rows[0] ? mapVoucherRow(normalizeBigInt(rows[0])) : null
}

/** Locks the vouchers (ascending id, so concurrent tills can't deadlock) and returns them by id. */
export async function lockVouchers(ids: number[], conn: mariadb.PoolConnection) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  const byId = new Map<number, VoucherWithBatch>()
  for (const id of sorted) {
    const rows = await query<any[]>(`${VOUCHER_SELECT} WHERE v.id = ? FOR UPDATE`, [id], conn)
    if (rows[0]) byId.set(id, mapVoucherRow(normalizeBigInt(rows[0])))
  }
  return byId
}

/** Current members of the voucher's item group that can still be sold. */
export async function redeemableItemIds(groupId: number, conn?: mariadb.PoolConnection) {
  const rows = await query<Array<{ id: unknown }>>(
    `SELECT i.id
     FROM item_group_items gi
     JOIN items i ON i.id = gi.item_id
     WHERE gi.group_id = ? AND i.is_active = 1
     ORDER BY i.name`,
    [groupId],
    conn,
  )
  return rows.map(row => Number(row.id))
}

export interface VoucherCheckContext {
  /** The event the voucher is used at (the order's event); null skips the event check (admin check view). */
  eventId: number | null
  /** Berlin local time of the use — now for a checkout, the order's time for a correction. */
  at: string
}

type CheckResult = null | { ok: false, error: string }

function checkValidity(voucher: VoucherWithBatch, ctx: VoucherCheckContext): CheckResult {
  if (voucher.event_id != null && ctx.eventId != null && voucher.event_id !== ctx.eventId) {
    return { ok: false, error: 'Gutschein ist für diese Veranstaltung nicht gültig' }
  }
  if (voucher.valid_until && ctx.at > voucher.valid_until) {
    return { ok: false, error: 'Gutschein ist abgelaufen' }
  }
  return null
}

/** Whether `units` of the voucher can be redeemed now. Item membership is checked separately. */
export function checkRedeemable(voucher: VoucherWithBatch, ctx: VoucherCheckContext, units = 1): CheckResult {
  if (voucher.status === 'revoked') return { ok: false, error: 'Gutschein ist gesperrt' }
  if (voucher.status !== 'active') return { ok: false, error: 'Gutschein ist nicht aktiv' }
  const invalid = checkValidity(voucher, ctx)
  if (invalid) return invalid
  if (voucher.units_remaining < units) return { ok: false, error: 'Gutschein hat nicht genug Einheiten übrig' }
  return null
}

/** Whether the voucher can be sold now: a paid, not yet sold voucher that hasn't expired. */
export function checkSellable(voucher: VoucherWithBatch, ctx: Pick<VoucherCheckContext, 'at'>): CheckResult {
  if (voucher.kind !== 'paid') return { ok: false, error: 'Kostenlose Gutscheine können nicht verkauft werden' }
  if (voucher.status === 'revoked') return { ok: false, error: 'Gutschein ist gesperrt' }
  if (voucher.status !== 'unsold') return { ok: false, error: 'Gutschein wurde bereits verkauft' }
  if (voucher.valid_until && ctx.at > voucher.valid_until) return { ok: false, error: 'Gutschein ist abgelaufen' }
  return null
}

export interface VoucherRedemption {
  order_id: number
  created_at: string
  event_id: number
  event_name: string | null
  item_name: string
  quantity: number
}

export async function loadRedemptions(voucherId: number): Promise<VoucherRedemption[]> {
  const rows: any[] = normalizeBigInt(await query<any[]>(
    `SELECT o.id AS order_id, o.created_at, o.event_id, e.name AS event_name, oi.item_name, oi.quantity
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN events e ON e.id = o.event_id
     WHERE oi.voucher_id = ? AND oi.line_kind = 'voucher_redemption'
     ORDER BY o.created_at DESC, oi.id DESC`,
    [voucherId],
  ))
  return rows.map(row => ({
    order_id: Number(row.order_id),
    created_at: String(row.created_at),
    event_id: Number(row.event_id),
    event_name: row.event_name ?? null,
    item_name: String(row.item_name),
    quantity: Number(row.quantity),
  }))
}

/** Thrown inside a booking transaction to roll it back with a user-facing error. */
export class VoucherBookingError extends Error {}

export interface VoucherDelta {
  /** Units taken (positive) or given back (negative). */
  unitsConsumed: number
  /** Sell the voucher with this order. */
  sell?: boolean
  /** Take the sale back: the voucher returns to unsold (only while untouched). */
  unsell?: boolean
}

export interface RequestedVoucherSale {
  code: string
  unit_price: number
}

/** `voucher_sales` of a request: valid codes, each at most once, with the charged price. */
export function normalizeVoucherSales(value: unknown): RequestedVoucherSale[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null

  const sales: RequestedVoucherSale[] = []
  for (const entry of value) {
    const normalized = normalizeVoucherCode((entry as any)?.code)
    const price = Number((entry as any)?.unit_price)
    if (!normalized.ok || !Number.isFinite(price) || price < 0) return null
    if (sales.some(sale => sale.code === normalized.code)) return null
    sales.push({ code: normalized.code, unit_price: round2(price) })
  }
  return sales
}

function withCode(error: string, code: string) {
  return `${error} (${formatVoucherCode(code)})`
}

export function addVoucherDelta(deltas: Map<number, VoucherDelta>, id: number, change: Partial<VoucherDelta>) {
  const delta = deltas.get(id) ?? { unitsConsumed: 0 }
  delta.unitsConsumed += change.unitsConsumed ?? 0
  if (change.sell) delta.sell = true
  if (change.unsell) delta.unsell = true
  deltas.set(id, delta)
}

/**
 * Checks the voucher lines of a request that don't depend on the voucher's
 * current state: the code exists, the item is in the voucher's group, a sale
 * is charged at the batch price (the client's price wins, but only a price the
 * batch actually has), no vouchers in Fachschaft orders. Fills voucher_id and
 * the deposit coverage snapshot into the redemption lines, builds the sale
 * lines and the per-voucher deltas. Status, units and validity are checked
 * later under lock by applyVoucherDeltas.
 */
export async function resolveVoucherLines(input: {
  lines: BookedLine[]
  sales: RequestedVoucherSale[]
  isFachschaft: boolean
}): Promise<{ ok: true, sales: BookedLine[], deltas: Map<number, VoucherDelta> } | { ok: false, error: string }> {
  const redemptions = input.lines.filter(line => line.line_kind === 'voucher_redemption')
  const deltas = new Map<number, VoucherDelta>()
  if (!redemptions.length && !input.sales.length) return { ok: true, sales: [], deltas }
  if (input.isFachschaft) return { ok: false, error: 'Gutscheine sind in Fachschaftsbestellungen nicht erlaubt' }

  const codes = [...new Set([...redemptions.map(line => line.voucher_code!), ...input.sales.map(sale => sale.code)])]
  const vouchers = new Map<string, VoucherWithBatch>()
  for (const code of codes) {
    const voucher = await loadVoucherByCode(code)
    if (!voucher) return { ok: false, error: withCode('Gutschein nicht gefunden', code) }
    vouchers.set(code, voucher)
  }

  const groupItems = new Map<number, Set<number>>()
  for (const line of redemptions) {
    const voucher = vouchers.get(line.voucher_code!)!
    if (!groupItems.has(voucher.item_group_id)) {
      groupItems.set(voucher.item_group_id, new Set(await groupItemIds(voucher.item_group_id)))
    }
    if (!groupItems.get(voucher.item_group_id)!.has(Number(line.item_id))) {
      return { ok: false, error: withCode('Artikel ist auf diesem Gutschein nicht einlösbar', voucher.code) }
    }
    line.voucher_id = voucher.id
    line.voucher_covers_deposit = voucher.includes_deposit
    line.line_total = lineCashTotal(line)
    addVoucherDelta(deltas, voucher.id, { unitsConsumed: line.quantity })
  }

  const sales: BookedLine[] = []
  for (const sale of input.sales) {
    const voucher = vouchers.get(sale.code)!
    if (voucher.kind !== 'paid' || voucher.sale_price == null) {
      return { ok: false, error: withCode('Kostenlose Gutscheine können nicht verkauft werden', voucher.code) }
    }
    if (Math.round(sale.unit_price * 100) !== Math.round(voucher.sale_price * 100)) {
      return { ok: false, error: withCode('Der Preis des Gutscheins stimmt nicht mit dem Preis der Charge überein', voucher.code) }
    }
    const line = {
      item_id: null,
      name: `Gutschein ${voucher.batch_name}`,
      quantity: 1,
      unit_price: voucher.sale_price,
      unit_deposit: 0,
      line_kind: 'voucher_sale' as const,
      voucher_id: voucher.id,
      voucher_code: voucher.code,
      voucher_covers_deposit: false,
    }
    sales.push({ ...line, line_total: lineCashTotal(line) })
    addVoucherDelta(deltas, voucher.id, { sell: true })
  }

  return { ok: true, sales, deltas }
}

/**
 * The only place that changes a voucher's units or sale state. Locks the
 * vouchers in ascending id order (so concurrent tills can't deadlock),
 * applies each voucher's sale before its redemptions (a voucher bought in a
 * cart can be redeemed in the same cart) and validates everything against the
 * locked rows. Throws VoucherBookingError, so the caller's transaction rolls
 * back as a whole.
 */
export async function applyVoucherDeltas(
  deltas: Map<number, VoucherDelta>,
  ctx: VoucherCheckContext,
  conn: mariadb.PoolConnection,
  orderId: number | null,
) {
  if (!deltas.size) return
  const locked = await lockVouchers([...deltas.keys()], conn)

  for (const id of [...deltas.keys()].sort((a, b) => a - b)) {
    const delta = deltas.get(id)!
    const voucher = locked.get(id)
    if (!voucher) throw new VoucherBookingError('Gutschein nicht gefunden')

    let status = voucher.status
    let soldOrderId = voucher.sold_order_id
    let soldAt: 'keep' | 'now' | 'clear' = 'keep'

    if (delta.sell) {
      const problem = checkSellable(voucher, ctx)
      if (problem) throw new VoucherBookingError(withCode(problem.error, voucher.code))
      status = 'active'
      soldOrderId = orderId
      soldAt = 'now'
    }

    const remaining = voucher.units_remaining - delta.unitsConsumed
    if (delta.unitsConsumed > 0) {
      const problem = checkRedeemable({ ...voucher, status }, ctx, delta.unitsConsumed)
      if (problem) throw new VoucherBookingError(withCode(problem.error, voucher.code))
    }
    if (remaining > voucher.units_total) {
      throw new VoucherBookingError(withCode('Es können nicht mehr Einheiten zurückgegeben werden als eingelöst wurden', voucher.code))
    }

    if (delta.unsell) {
      if (remaining !== voucher.units_total) {
        throw new VoucherBookingError(withCode('Gutschein wurde bereits eingelöst und kann nicht zurückgenommen werden', voucher.code))
      }
      if (voucher.status !== 'revoked') status = 'unsold'
      soldOrderId = null
      soldAt = 'clear'
    }

    const soldAtSql = soldAt === 'now' ? 'CURRENT_TIMESTAMP' : soldAt === 'clear' ? 'NULL' : 'sold_at'
    await query(
      `UPDATE vouchers SET status = ?, units_remaining = ?, sold_order_id = ?, sold_at = ${soldAtSql} WHERE id = ?`,
      [status, remaining, soldOrderId, id],
      conn,
    )
  }
}
