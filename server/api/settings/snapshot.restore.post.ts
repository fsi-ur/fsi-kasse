import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { readMultipart } from '~/server/utils/api/request'
import {
  parseEncryptedDatabaseSnapshot,
  restoreDatabaseSnapshot,
  SnapshotError,
  type SnapshotErrorCode,
} from '~/server/utils/databaseSnapshots'
import { consumeSnapshotRestoreSession } from '~/server/utils/snapshotRestoreSessions'

const MAX_SNAPSHOT_UPLOAD_BYTES = 256 * 1024 * 1024
const MAX_SNAPSHOT_UPLOAD_LABEL = '256 MB'

interface RestoreSnapshotSuccess {
  ok: true
  tables: number
  rows: number
}

interface RestoreSnapshotError {
  ok: false
  error: string
}

export type RestoreSnapshotResponse = RestoreSnapshotSuccess | RestoreSnapshotError

function statusForSnapshotErrorCode(code: SnapshotErrorCode) {
  if (code === 'databaseUnavailable' || code === 'databaseBusy' || code === 'restoreInProgress') return 503
  if (code === 'databaseDenied' || code === 'databaseFull') return 500
  return 400
}

function uploadTooLargeError() {
  return createError({
    statusCode: 413,
    statusMessage: 'Snapshot upload is too large',
    message: 'Snapshot upload exceeds the maximum allowed size',
    data: { snapshotErrorCode: 'uploadTooLarge', snapshotErrorParams: { size: MAX_SNAPSHOT_UPLOAD_LABEL } },
  })
}

export default defineEventHandler(async (event): Promise<RestoreSnapshotResponse> => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_SNAPSHOT_UPLOAD_BYTES) throw uploadTooLargeError()

  try {
    const contentType = event.node.req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) throw new Error('Encrypted snapshot upload is required')

    const multipart = await readMultipart(event)
    if (!multipart) throw new Error('Missing restore payload')

    const snapshotFile = multipart.formData.find(field => field.name === 'snapshotFile' && field.filename)
    if (snapshotFile && snapshotFile.data.length > MAX_SNAPSHOT_UPLOAD_BYTES) throw uploadTooLargeError()

    const restoreToken = multipart.getField('restoreToken')

    const snapshot = restoreToken
      ? consumeSnapshotRestoreSession(restoreToken).snapshot
      : (() => {
          if (!snapshotFile) throw new Error('Missing encrypted snapshot')
          if (!snapshotFile.data.length) throw new SnapshotError('corruptedFile', 'Uploaded snapshot file is empty')
          const password = multipart.getField('password')
          return parseEncryptedDatabaseSnapshot(snapshotFile.data, password)
        })()

    return await restoreDatabaseSnapshot(snapshot)
  } catch (err: any) {
    if (err?.statusCode) throw err

    console.error('Failed to restore database snapshot:', err)
    throw createError({
      statusCode: err instanceof SnapshotError ? statusForSnapshotErrorCode(err.code) : 400,
      statusMessage: 'Failed to restore database snapshot',
      message: String(err?.message || err),
      data: err instanceof SnapshotError ? { snapshotErrorCode: err.code, snapshotErrorParams: err.params } : undefined,
    })
  }
})
