import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { resolveAssignableAffiliation } from '~/server/utils/affiliations'
import {
  deleteGuestSessions,
  getRequestTokenHash,
  isGuestAccessLevel,
  isUsernameTaken,
  loadManageableGuestAccount,
  parseGuestUsername,
} from '~/server/utils/guests'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestAccount(current.user, body?.id, { allowSelf: true })
  if (!target.ok) return target
  const guest = target.guest

  let username = guest.username
  if (body?.username !== undefined) {
    const parsed = parseGuestUsername(body.username)
    if (!parsed) return { ok: false, error: 'Bitte einen Benutzernamen eingeben' }
    username = parsed
  }

  const accessLevel = body?.access_level ?? guest.access_level
  if (!isGuestAccessLevel(accessLevel)) return { ok: false, error: 'Ungültige Berechtigungsstufe' }

  const affiliation = await resolveAssignableAffiliation(current.user, body?.affiliation_id, guest.affiliation_id)
  if (!affiliation.ok) return affiliation

  if (username !== guest.username && await isUsernameTaken(username, { excludeGuestId: guest.id })) {
    return { ok: false, error: 'Dieser Benutzername ist bereits vergeben' }
  }

  const permissionsChanged = accessLevel !== guest.access_level || affiliation.affiliationId !== guest.affiliation_id

  try {
    await withTransaction(async (conn) => {
      await query(
        `UPDATE guest_users SET username = ?, access_level = ?, affiliation_id = ? WHERE id = ?`,
        [username, accessLevel, affiliation.affiliationId, guest.id],
        conn,
      )
      if (permissionsChanged) {
        await deleteGuestSessions(guest.id, conn, target.isSelf ? getRequestTokenHash(event) : undefined)
      }
    })
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Dieser Benutzername ist bereits vergeben' }
    return { ok: false, error: err?.code || 'Gastkonto konnte nicht gespeichert werden' }
  }

  return { ok: true }
})
