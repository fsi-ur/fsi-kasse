import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { listBatchSummaries } from '~/server/utils/vouchers'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  return { ok: true, batches: await listBatchSummaries() }
})
