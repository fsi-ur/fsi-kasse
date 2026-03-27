import { defineEventHandler } from 'h3'
import { getCurrentUserFromEvent } from '~/server/utils/sessionGuard'
import type { SessionResponse } from '~/server/utils/sessionGuard'

export default defineEventHandler(async (event): Promise<SessionResponse> => {
  return await getCurrentUserFromEvent(event, true)
})
