import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import {
  bookedTotal,
  findCommittedCheckout,
  isDuplicateEntryError,
  normalizeClientUuid,
  normalizeLines,
  resolveBookedLines,
  round2,
  validateCashierAndEvent,
} from '~/server/utils/checkout'
import { resolveStandId } from '~/server/utils/stands'

type DonationInput =
  | null
  | { mode: 'direct', amount: number }
  | { mode: 'paid', paid_amount: number }

function parseDonation(value: unknown): DonationInput | undefined {
  if (value == null) return null
  const donation = value as Record<string, unknown>

  if (donation.mode === 'direct') {
    const amount = Number(donation.amount)
    if (!Number.isFinite(amount) || amount <= 0) return undefined
    return { mode: 'direct', amount }
  }

  if (donation.mode === 'paid') {
    const paidAmount = Number(donation.paid_amount)
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return undefined
    return { mode: 'paid', paid_amount: paidAmount }
  }

  return undefined
}

// Books a whole checkout (order and optional donation) atomically. Every
// request carries a client-generated UUID, so the offline queue can replay it
// safely
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const body = await readBody(event)

  const clientUuid = normalizeClientUuid(body?.client_uuid)
  if (!clientUuid) {
    return { ok: false, error: 'Missing or invalid client_uuid' }
  }

  const committed = await findCommittedCheckout(clientUuid)
  if (committed) return committed

  const cashierId = Number(body?.cashier_id)
  const eventId = Number(body?.event_id)
  if (!cashierId || !eventId) {
    return { ok: false, error: 'Missing order details' }
  }

  const lines = normalizeLines(body?.items)
  if (!lines) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const donation = parseDonation(body?.donation)
  if (donation === undefined) {
    return { ok: false, error: 'Missing or invalid donation details' }
  }

  if (lines.size === 0 && !donation) {
    return { ok: false, error: 'Missing or invalid order items' }
  }

  const invalid = await validateCashierAndEvent(cashierId, eventId)
  if (invalid) return invalid

  const standId = await resolveStandId(body?.stand_id)

  const resolved = await resolveBookedLines(lines)
  if (!resolved.ok) return resolved
  const booked = resolved.booked

  const isFachschaft = Boolean(body?.is_fachschaft) && booked.length > 0
  const total = bookedTotal(booked, isFachschaft)

  const donationAmount = !donation
    ? 0
    : donation.mode === 'direct'
      ? round2(donation.amount)
      : Math.max(0, round2(donation.paid_amount - total))

  if (booked.length === 0 && donationAmount <= 0) {
    return { ok: false, error: 'Missing or invalid donation details' }
  }

  try {
    const order_id = await withTransaction(async (conn) => {
      let orderId: number | null = null

      if (booked.length > 0) {
        const result = await query(
          `INSERT INTO orders (cashier_id, event_id, stand_id, fachschaft, client_uuid) VALUES (?, ?, ?, ?, ?)`,
          [cashierId, eventId, standId, isFachschaft ? 1 : 0, clientUuid],
          conn,
        )

        orderId = Number(normalizeBigInt((result as any).insertId))

        for (const line of booked) {
          await query(
            `INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, unit_deposit)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, line.item_id, line.name, line.quantity, line.unit_price, line.unit_deposit],
            conn,
          )
        }
      }

      if (donationAmount > 0) {
        await query(
          `INSERT INTO donations (event_id, cashier_id, stand_id, amount, order_id, client_uuid) VALUES (?, ?, ?, ?, ?, ?)`,
          [eventId, cashierId, standId, donationAmount.toFixed(2), orderId, clientUuid],
          conn,
        )
      }

      return orderId
    })

    return { ok: true, order_id, total, lines: booked, donation_amount: donationAmount }
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error

    const replayed = await findCommittedCheckout(clientUuid)
    if (replayed) return replayed
    throw error
  }
})
