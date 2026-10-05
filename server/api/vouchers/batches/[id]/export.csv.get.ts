import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { loadBatch, parseExportStatuses, selectExportVouchers, slugify } from '~/server/utils/vouchers'
import { buildVoucherCsv } from '~/server/utils/voucherExport'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige ID' }

  const statuses = parseExportStatuses(getQuery(event).status)
  if (!statuses) return { ok: false, error: 'Ungültiger Status' }

  const batch = await loadBatch(batchId)
  if (!batch) return { ok: false, error: 'Charge nicht gefunden' }

  const vouchers = await selectExportVouchers(batchId, statuses)

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="gutscheine-${slugify(batch.name)}.csv"`)
  return buildVoucherCsv(batch, vouchers)
})
