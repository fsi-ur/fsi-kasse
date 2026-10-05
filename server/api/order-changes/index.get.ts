import { defineEventHandler, getQuery } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { loadChangeRequests, type OrderChangeStatus } from '~/server/utils/orderChanges'

const STATUSES: OrderChangeStatus[] = ['pending', 'approved', 'rejected']

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const status = getQuery(event).status
  if (status != null && !STATUSES.includes(status as OrderChangeStatus)) {
    return { ok: false, error: 'Invalid status' }
  }

  const requests = await loadChangeRequests({ status: status as OrderChangeStatus | undefined })
  return { ok: true, requests }
})
