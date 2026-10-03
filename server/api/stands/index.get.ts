import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { listStands } from '~/server/utils/stands'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  return { ok: true, stands: await listStands() }
})
