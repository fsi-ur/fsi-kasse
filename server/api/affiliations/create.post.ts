import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { parseAffiliationName, requireAffiliationAdmin } from '~/server/utils/affiliations'

export default defineEventHandler(async (event) => {
  const current = await requireAffiliationAdmin(event)
  if (!current.ok) return current

  const body = await readBody(event)
  const name = parseAffiliationName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  try {
    await query(`INSERT INTO affiliations (name, is_active) VALUES (?, 1)`, [name])
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Zugehörigkeit existiert bereits' }
    return { ok: false, error: err?.code || 'Zugehörigkeit konnte nicht angelegt werden' }
  }

  return { ok: true }
})
