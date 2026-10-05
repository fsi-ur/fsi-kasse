import { defineEventHandler } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { listItemGroups } from '~/server/utils/itemGroups'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  return { ok: true, groups: await listItemGroups() }
})
