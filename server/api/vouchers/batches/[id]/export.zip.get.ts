import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { loadBatch, parseExportStatuses, parseQrColors, selectExportVouchers, slugify } from '~/server/utils/vouchers'
import { buildVoucherZip, parseQrMargin } from '~/server/utils/voucherExport'

// vouchers.csv plus qr/<code>.svg and qr/<code>.png for every voucher. Invalid
// colours are an error, never a silent fallback to black on white.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const batchId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige ID' }

  const params = getQuery(event)
  const statuses = parseExportStatuses(params.status)
  if (!statuses) return { ok: false, error: 'Ungültiger Status' }

  const colors = parseQrColors(params.qr_color, params.background_color)
  if (!colors.ok) return colors

  // Quiet zone around the code in modules (the space between the code and the image edge).
  const margin = parseQrMargin(params.margin)
  if (margin === null) return { ok: false, error: 'Ungültiger Rand' }

  const batch = await loadBatch(batchId)
  if (!batch) return { ok: false, error: 'Charge nicht gefunden' }

  const vouchers = await selectExportVouchers(batchId, statuses)
  const zip = await buildVoucherZip(batch, vouchers, colors, margin)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="gutscheine-${slugify(batch.name)}.zip"`)
  return Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength)
})
