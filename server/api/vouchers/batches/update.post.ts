import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { batchInUse, parseBatchValueFields, parseEditableBatchFields } from '~/server/utils/vouchers'
import { voucherDepositMode } from '~/utils/voucherDeposit'

// What a voucher is worth (kind, item group, units, deposit rule, price) can
// only change while no voucher of the batch has been sold or redeemed. Once one
// is in use these are fixed, which keeps the only accepted sale price the
// batch's current one and every sold voucher worth what it was sold as.
const VALUE_FIELDS = ['kind', 'item_group_id', 'units_per_voucher', 'deposit_mode', 'sale_price'] as const

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const parsed = await parseEditableBatchFields(body ?? {})
  if (!parsed.ok) return parsed
  const fields = parsed.fields

  return withTransaction(async (conn) => {
    const rows = await query<any[]>(
      `SELECT kind, item_group_id, units_per_voucher, deposit_mode, includes_deposit, sale_price
       FROM voucher_batches WHERE id = ? FOR UPDATE`,
      [id],
      conn,
    )
    const batch = rows[0]
    if (!batch) return { ok: false as const, error: 'Charge nicht gefunden' }

    const stored = {
      kind: String(batch.kind) as 'paid' | 'free',
      item_group_id: Number(batch.item_group_id),
      units_per_voucher: Number(batch.units_per_voucher),
      sale_price: batch.sale_price == null ? null : Number(batch.sale_price),
      deposit_mode: voucherDepositMode(batch),
    }

    // Omitted value fields keep their stored value. A free batch has no price,
    // so a price is only carried over while the batch stays paid.
    const kind = body?.kind ?? stored.kind
    const parsedValue = await parseBatchValueFields({
      kind,
      item_group_id: body?.item_group_id ?? stored.item_group_id,
      units_per_voucher: body?.units_per_voucher ?? stored.units_per_voucher,
      deposit_mode: body?.deposit_mode ?? stored.deposit_mode,
      sale_price: kind === 'paid' ? (body?.sale_price ?? stored.sale_price) : body?.sale_price,
    }, conn, stored.item_group_id)
    if (!parsedValue.ok) return parsedValue
    const value = parsedValue.fields

    const changed = VALUE_FIELDS.filter(field => value[field] !== stored[field])
    if (changed.length && await batchInUse(id, conn)) {
      return {
        ok: false as const,
        error: changed.length === 1 && changed[0] === 'sale_price'
          ? 'Der Preis kann nicht mehr geändert werden, weil bereits Gutscheine dieser Charge verkauft wurden'
          : 'Art, Artikelgruppe, Einheiten, Pfand und Preis können nicht mehr geändert werden, weil bereits Gutscheine dieser Charge verkauft oder eingelöst wurden',
      }
    }

    await query(
      `UPDATE voucher_batches
       SET name = ?, note = ?, event_id = ?, valid_until = ?,
           kind = ?, item_group_id = ?, units_per_voucher = ?, sale_price = ?, deposit_mode = ?, includes_deposit = ?
       WHERE id = ?`,
      [fields.name, fields.note, fields.event_id, fields.valid_until,
        value.kind, value.item_group_id, value.units_per_voucher, value.sale_price, value.deposit_mode,
        value.deposit_mode === 'customer' ? 0 : 1, id],
      conn,
    )

    // No voucher is in use, so every one still holds its full units and none
    // was sold: bring them in line with the batch as if created this way.
    if (value.units_per_voucher !== stored.units_per_voucher) {
      await query(
        `UPDATE vouchers SET units_total = ?, units_remaining = ? WHERE batch_id = ?`,
        [value.units_per_voucher, value.units_per_voucher, id],
        conn,
      )
    }
    if (value.kind !== stored.kind) {
      await query(
        `UPDATE vouchers SET status = ? WHERE batch_id = ? AND status <> 'revoked'`,
        [value.kind === 'free' ? 'active' : 'unsold', id],
        conn,
      )
    }

    return { ok: true as const }
  })
})
