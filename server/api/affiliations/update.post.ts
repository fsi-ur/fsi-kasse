import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { parseAffiliationName, requireAffiliationAdmin } from '~/server/utils/affiliations'

export default defineEventHandler(async (event) => {
  const current = await requireAffiliationAdmin(event)
  if (!current.ok) return current

  const body = await readBody(event)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Ungültige ID' }

  const name = parseAffiliationName(body?.name)
  if (!name) return { ok: false, error: 'Bitte einen Namen eingeben' }

  try {
    const result: any = await query(`UPDATE affiliations SET name = ? WHERE id = ?`, [name, id])
    if (Number(result.affectedRows ?? 0) === 0) return { ok: false, error: 'Zugehörigkeit nicht gefunden' }
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Zugehörigkeit existiert bereits' }
    return { ok: false, error: err?.code || 'Zugehörigkeit konnte nicht gespeichert werden' }
  }

  return { ok: true }
})
