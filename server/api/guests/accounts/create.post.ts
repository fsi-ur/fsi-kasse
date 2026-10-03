import { defineEventHandler, readBody } from 'h3'
import { query } from '~/server/utils/db'
import { hashPassword } from '~/server/utils/auth'
import { requirePermission } from '~/server/utils/api/guards'
import { resolveAssignableAffiliation } from '~/server/utils/affiliations'
import { isGuestAccessLevel, isUsernameTaken, parseGuestUsername } from '~/server/utils/guests'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current

  const body = await readBody(event)

  const username = parseGuestUsername(body?.username)
  if (!username) return { ok: false, error: 'Bitte einen Benutzernamen eingeben' }

  const password = String(body?.password || '')
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein` }
  }

  const accessLevel = body?.access_level ?? 'use'
  if (!isGuestAccessLevel(accessLevel)) return { ok: false, error: 'Ungültige Berechtigungsstufe' }

  const affiliation = await resolveAssignableAffiliation(current.user, body?.affiliation_id)
  if (!affiliation.ok) return affiliation

  if (await isUsernameTaken(username)) return { ok: false, error: 'Dieser Benutzername ist bereits vergeben' }

  const mustChangePassword = body?.must_change_password ? 1 : 0

  const passwordHash = await hashPassword(password)

  try {
    await query(
      `INSERT INTO guest_users (username, password_hash, access_level, affiliation_id, is_active, must_change_password, created_by)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [username, passwordHash, accessLevel, affiliation.affiliationId, mustChangePassword, current.user.username],
    )
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') return { ok: false, error: 'Dieser Benutzername ist bereits vergeben' }
    return { ok: false, error: err?.code || 'Gastkonto konnte nicht angelegt werden' }
  }

  return { ok: true }
})
