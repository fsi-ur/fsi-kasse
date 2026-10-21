import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { insertVouchers, MAX_VOUCHERS_PER_BATCH } from '~/server/utils/voucherCodes'
import { parseBatchValueFields, parseEditableBatchFields } from '~/server/utils/vouchers'

// Creates a batch together with its vouchers. Free vouchers are usable right
// away; paid ones are worthless (`unsold`) until sold in a checkout.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)

  const parsed = await parseEditableBatchFields(body ?? {})
  if (!parsed.ok) return parsed
  const fields = parsed.fields

  const parsedValue = await parseBatchValueFields(body ?? {})
  if (!parsedValue.ok) return parsedValue
  const { kind, item_group_id: itemGroupId, units_per_voucher: units, sale_price: salePrice, deposit_mode: depositMode } = parsedValue.fields

  const count = Number(body?.count)
  if (!Number.isInteger(count) || count < 1 || count > MAX_VOUCHERS_PER_BATCH) {
    return { ok: false, error: `Die Anzahl muss zwischen 1 und ${MAX_VOUCHERS_PER_BATCH} liegen` }
  }

  const id = await withTransaction(async (conn) => {
    const result: any = await query(
      `INSERT INTO voucher_batches
         (name, kind, item_group_id, units_per_voucher, sale_price, deposit_mode, includes_deposit, event_id, valid_until, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fields.name, kind, itemGroupId, units, salePrice, depositMode, depositMode === 'customer' ? 0 : 1,
        fields.event_id, fields.valid_until, fields.note, current.user.username],
      conn,
    )
    const batchId = Number(result.insertId)
    await insertVouchers({ id: batchId, status: kind === 'free' ? 'active' : 'unsold', units }, count, conn)
    return batchId
  })

  return { ok: true, id }
})
