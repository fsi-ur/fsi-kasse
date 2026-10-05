import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { MAX_LAYOUT_BYTES, validateVoucherPdfLayout } from '~/utils/voucherPdfLayout'

// Stores (or with `layout: null` clears) the PDF stamper's slot layout. The PDF
// itself never reaches the server.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const batchId = Number(body?.batch_id)
  if (!Number.isInteger(batchId) || batchId <= 0) return { ok: false, error: 'Ungültige ID' }

  let stored: string | null = null
  if (body?.layout !== null) {
    const validated = validateVoucherPdfLayout(body?.layout)
    if (!validated.ok) return validated
    stored = JSON.stringify(validated.layout)
    if (Buffer.byteLength(stored, 'utf8') > MAX_LAYOUT_BYTES) return { ok: false, error: 'Das Layout ist zu groß' }
  }

  const result: any = await query(`UPDATE voucher_batches SET pdf_layout = ? WHERE id = ?`, [stored, batchId])
  if (Number(result.affectedRows ?? 0) === 0) return { ok: false, error: 'Charge nicht gefunden' }

  return { ok: true }
})
