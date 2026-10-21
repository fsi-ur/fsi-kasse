import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

// Per-event switch for card payments; the local events row carries it in both modes, like fachschaft_enabled.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const { id, card_enabled } = await readBody(event)
  if (id == undefined || card_enabled == undefined) return { ok: false, error: 'Missing fields' }
  if (card_enabled != 0 && card_enabled != 1) return { ok: false, error: 'Illegal value for card_enabled' }

  await query(`UPDATE events SET card_enabled = ? WHERE id = ?`, [card_enabled ? 1 : 0, id])
  return { ok: true }
})
