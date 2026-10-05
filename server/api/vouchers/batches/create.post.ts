import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { insertVouchers, MAX_VOUCHERS_PER_BATCH } from '~/server/utils/voucherCodes'
import { MAX_UNITS_PER_VOUCHER, parseEditableBatchFields, parseSalePrice } from '~/server/utils/vouchers'

// Creates a batch together with its vouchers. Free vouchers are usable right
// away; paid ones are worthless (`unsold`) until sold in a checkout.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)

  const parsed = await parseEditableBatchFields(body ?? {})
  if (!parsed.ok) return parsed
  const fields = parsed.fields

  const kind = body?.kind
  if (kind !== 'paid' && kind !== 'free') return { ok: false, error: 'Ungültige Gutscheinart' }

  const itemGroupId = Number(body?.item_group_id)
  if (!Number.isInteger(itemGroupId) || itemGroupId <= 0) return { ok: false, error: 'Bitte eine Artikelgruppe wählen' }
  const groups = await query<Array<{ id: unknown, is_active: unknown }>>(`SELECT id, is_active FROM item_groups WHERE id = ? LIMIT 1`, [itemGroupId])
  if (!groups[0]) return { ok: false, error: 'Artikelgruppe nicht gefunden' }
  if (!Number(groups[0].is_active)) return { ok: false, error: 'Die Artikelgruppe ist nicht aktiv' }

  const units = Number(body?.units_per_voucher)
  if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS_PER_VOUCHER) {
    return { ok: false, error: `Einheiten pro Gutschein müssen zwischen 1 und ${MAX_UNITS_PER_VOUCHER} liegen` }
  }

  let salePrice: number | null = null
  if (kind === 'paid') {
    salePrice = parseSalePrice(body?.sale_price)
    if (salePrice == null) return { ok: false, error: 'Bitte einen gültigen Verkaufspreis größer als 0 eingeben' }
  } else if (body?.sale_price != null && body.sale_price !== '') {
    return { ok: false, error: 'Kostenlose Gutscheine haben keinen Verkaufspreis' }
  }

  const count = Number(body?.count)
  if (!Number.isInteger(count) || count < 1 || count > MAX_VOUCHERS_PER_BATCH) {
    return { ok: false, error: `Die Anzahl muss zwischen 1 und ${MAX_VOUCHERS_PER_BATCH} liegen` }
  }

  const includesDeposit = body?.includes_deposit ? 1 : 0

  const id = await withTransaction(async (conn) => {
    const result: any = await query(
      `INSERT INTO voucher_batches
         (name, kind, item_group_id, units_per_voucher, sale_price, includes_deposit, event_id, valid_until, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fields.name, kind, itemGroupId, units, salePrice, includesDeposit, fields.event_id, fields.valid_until, fields.note, current.user.username],
      conn,
    )
    const batchId = Number(result.insertId)
    await insertVouchers({ id: batchId, status: kind === 'free' ? 'active' : 'unsold', units }, count, conn)
    return batchId
  })

  return { ok: true, id }
})
