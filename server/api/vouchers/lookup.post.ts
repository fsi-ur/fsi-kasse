import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import {
  berlinLocalNow,
  checkRedeemable,
  checkSellable,
  displayStatus,
  loadRedemptions,
  loadVoucherByCode,
  redeemableItemIds,
  utcToBerlinLocal,
  type VoucherCheckContext,
} from '~/server/utils/vouchers'
import { formatVoucherCode, normalizeVoucherCode } from '~/utils/voucherCode'

// Read-only: what a scanned code is and what the cashier can do with it right
// now. Selling/redeeming is decided again, under lock, when the order is booked.
// With `order_id` the check is made as of that order (event and time) — for
// change requests, which correct a past sale.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)
  const normalized = normalizeVoucherCode(body?.code)
  if (!normalized.ok) return { ok: false, error: 'Ungültiger Gutscheincode' }

  let ctx: VoucherCheckContext
  if (body?.order_id != null && body.order_id !== '') {
    const orderId = Number(body.order_id)
    const orders = Number.isInteger(orderId) && orderId > 0
      ? await query<Array<{ event_id: unknown, created_at: unknown }>>(`SELECT event_id, created_at FROM orders WHERE id = ? LIMIT 1`, [orderId])
      : []
    if (!orders[0]) return { ok: false, error: 'Order does not exist' }
    ctx = { eventId: Number(orders[0].event_id), at: utcToBerlinLocal(String(orders[0].created_at)) }
  } else if (body?.event_id != null && body.event_id !== '') {
    const eventId = Number(body.event_id)
    if (!Number.isInteger(eventId) || eventId <= 0) return { ok: false, error: 'Missing order details' }
    ctx = { eventId, at: berlinLocalNow() }
  } else {
    ctx = { eventId: null, at: berlinLocalNow() }
  }

  const voucher = await loadVoucherByCode(normalized.code)
  if (!voucher) return { ok: false, error: 'Gutschein nicht gefunden' }

  const sellProblem = checkSellable(voucher, ctx)
  const redeemProblem = checkRedeemable(voucher, ctx)
  const action = !sellProblem ? 'sell' : !redeemProblem ? 'redeem' : 'none'
  const reason = action !== 'none'
    ? null
    : (voucher.kind === 'paid' && voucher.status === 'unsold' ? sellProblem : redeemProblem)?.error ?? null

  return {
    ok: true,
    voucher: {
      id: voucher.id,
      code: voucher.code,
      code_formatted: formatVoucherCode(voucher.code),
      status: voucher.status,
      display_status: displayStatus(voucher.status, voucher.units_remaining),
      units_total: voucher.units_total,
      units_remaining: voucher.units_remaining,
      sold_order_id: voucher.sold_order_id,
      sold_at: voucher.sold_at,
      revoked_at: voucher.revoked_at,
      revoked_by: voucher.revoked_by,
      revoke_reason: voucher.revoke_reason,
      batch: {
        id: voucher.batch_id,
        name: voucher.batch_name,
        kind: voucher.kind,
        item_group_id: voucher.item_group_id,
        item_group_name: voucher.item_group_name,
        sale_price: voucher.sale_price,
        includes_deposit: voucher.includes_deposit,
        event_id: voucher.event_id,
        event_name: voucher.event_name,
        valid_until: voucher.valid_until,
      },
      allowed_item_ids: await redeemableItemIds(voucher.item_group_id),
      redemptions: await loadRedemptions(voucher.id),
    },
    action,
    reason,
  }
})
