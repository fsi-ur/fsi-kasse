import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { batchInUse, parseEditableBatchFields, parseSalePrice } from '~/server/utils/vouchers'

// What a voucher is worth never changes after creation: kind, item group,
// units and deposit coverage are fixed, and a paid batch's price is fixed once
// one of its vouchers was sold. That keeps the only accepted sale price the
// batch's current one.
const IMMUTABLE_FIELDS = ['kind', 'item_group_id', 'units_per_voucher', 'includes_deposit'] as const

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
      `SELECT kind, item_group_id, units_per_voucher, includes_deposit, sale_price
       FROM voucher_batches WHERE id = ? FOR UPDATE`,
      [id],
      conn,
    )
    const batch = rows[0]
    if (!batch) return { ok: false as const, error: 'Charge nicht gefunden' }

    for (const field of IMMUTABLE_FIELDS) {
      if (body?.[field] === undefined) continue
      const stored = field === 'kind' ? String(batch[field]) : Number(batch[field])
      const requested = field === 'kind' ? String(body[field]) : Number(field === 'includes_deposit' ? Boolean(body[field]) : body[field])
      if (stored !== requested) {
        return { ok: false as const, error: 'Art, Artikelgruppe, Einheiten und Pfand können nach dem Anlegen nicht mehr geändert werden' }
      }
    }

    let salePrice = batch.sale_price == null ? null : Number(batch.sale_price)
    if (batch.kind === 'paid' && body?.sale_price !== undefined) {
      const requested = parseSalePrice(body.sale_price)
      if (requested == null) return { ok: false as const, error: 'Bitte einen gültigen Verkaufspreis größer als 0 eingeben' }
      if (requested !== salePrice) {
        if (await batchInUse(id, conn)) {
          return { ok: false as const, error: 'Der Preis kann nicht mehr geändert werden, weil bereits Gutscheine dieser Charge verkauft wurden' }
        }
        salePrice = requested
      }
    }

    await query(
      `UPDATE voucher_batches SET name = ?, note = ?, event_id = ?, valid_until = ?, sale_price = ? WHERE id = ?`,
      [fields.name, fields.note, fields.event_id, fields.valid_until, salePrice, id],
      conn,
    )
    return { ok: true as const }
  })
})
