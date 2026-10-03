import { defineEventHandler, readBody } from 'h3'
import { query, withTransaction } from '~/server/utils/db'
import { hashPassword } from '~/server/utils/auth'
import { requirePermission } from '~/server/utils/api/guards'
import { deleteGuestSessions, getRequestTokenHash, loadManageableGuestAccount } from '~/server/utils/guests'
import { MIN_PASSWORD_LENGTH } from '~/config/validation'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage', { touch: false })
  if (!current.ok) return current

  const body = await readBody(event)
  const target = await loadManageableGuestAccount(current.user, body?.id, { allowSelf: true })
  if (!target.ok) return target

  const newPassword = String(body?.newPassword || '')
  const confirmPassword = String(body?.confirmPassword || '')

  if (!newPassword || !confirmPassword) return { ok: false, error: 'Bitte alle Felder ausfüllen' }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein` }
  }
  if (newPassword !== confirmPassword) return { ok: false, error: 'Die Passwörter stimmen nicht überein' }

  const mustChangePassword = !target.isSelf && body?.must_change_password ? 1 : 0

  const passwordHash = await hashPassword(newPassword)

  try {
    await withTransaction(async (conn) => {
      await query(
        `UPDATE guest_users SET password_hash = ?, must_change_password = ? WHERE id = ?`,
        [passwordHash, mustChangePassword, target.guest.id],
        conn,
      )
      await deleteGuestSessions(target.guest.id, conn, target.isSelf ? getRequestTokenHash(event) : undefined)
    })
  } catch (err: any) {
    return { ok: false, error: err?.code || 'Passwort konnte nicht gesetzt werden' }
  }

  return { ok: true }
})
