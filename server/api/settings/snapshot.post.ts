import { createError, defineEventHandler, readBody, sendStream, setHeader } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { createEncryptedDatabaseSnapshotStream, SnapshotError } from '~/server/utils/databaseSnapshots'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody<{ password?: string }>(event)

  let stream: ReturnType<typeof createEncryptedDatabaseSnapshotStream>
  try {
    stream = createEncryptedDatabaseSnapshotStream(body?.password)
  } catch (err: any) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Failed to create encrypted database snapshot',
      message: String(err?.message || err),
      data: err instanceof SnapshotError ? { snapshotErrorCode: err.code, snapshotErrorParams: err.params } : undefined,
    })
  }

  const date = new Date().toISOString().slice(0, 10)

  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="kassensystem-db-${date}.json.enc"`)
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')

  stream.on('error', (err) => {
    console.error('Failed to stream database snapshot:', err)
    event.node.res.destroy()
  })

  return sendStream(event, stream)
})
