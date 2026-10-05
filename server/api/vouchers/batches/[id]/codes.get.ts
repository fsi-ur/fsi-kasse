import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { loadBatch, parseExportStatuses, selectExportVouchers } from '~/server/utils/vouchers'
import { formatVoucherCode } from '~/utils/voucherCode'

// The codes for the PDF stamper — same selection and order as the CSV export.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige ID' }

  const statuses = parseExportStatuses(getQuery(event).status)
  if (!statuses) return { ok: false, error: 'Ungültiger Status' }

  if (!await loadBatch(batchId)) return { ok: false, error: 'Charge nicht gefunden' }

  const vouchers = await selectExportVouchers(batchId, statuses)
  return {
    ok: true,
    codes: vouchers.map(voucher => ({ id: voucher.id, code: voucher.code, code_formatted: formatVoucherCode(voucher.code) })),
  }
})
