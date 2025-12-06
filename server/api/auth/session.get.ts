import { defineEventHandler } from 'h3'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUserFromEvent(event, { touch: true })
  return { ok: !!user, user: user }
})