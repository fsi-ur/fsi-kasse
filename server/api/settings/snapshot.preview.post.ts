import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { readMultipart } from '~/server/utils/api/request'
import {
  parseEncryptedDatabaseSnapshot,
  previewDatabaseSnapshotForCurrentSchema,
  SnapshotError,
  type SnapshotErrorCode,
  type SnapshotPreview,
} from '~/server/utils/databaseSnapshots'
import { createSnapshotRestoreSession } from '~/server/utils/snapshotRestoreSessions'

const MAX_SNAPSHOT_UPLOAD_BYTES = 256 * 1024 * 1024
const MAX_SNAPSHOT_UPLOAD_LABEL = '256 MB'

interface PreviewSnapshotError {
  ok: false
  error: string
}

interface PreviewSnapshotSuccess extends SnapshotPreview {
  restoreToken: string
}

export type PreviewSnapshotResponse = PreviewSnapshotSuccess | PreviewSnapshotError

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

export default defineEventHandler(async (event): Promise<PreviewSnapshotResponse> => {
  const current = await requirePermission(event, 'cash_register.manage', { touch: false })
  if (!current.ok) return current

  // readMultipart buffers the whole request in memory with no cap, so reject an
  // oversized upload before touching it — a client-side check alone cannot be trusted.
  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_SNAPSHOT_UPLOAD_BYTES) throw uploadTooLargeError()

  try {
    const contentType = event.node.req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) throw new Error('Encrypted snapshot upload is required')

    const multipart = await readMultipart(event)
    if (!multipart) throw new Error('Missing restore preview payload')

    const snapshotFile = multipart.formData.find(field => field.name === 'snapshotFile' && field.filename)
    if (!snapshotFile) throw new Error('Missing encrypted snapshot')
    if (snapshotFile.data.length > MAX_SNAPSHOT_UPLOAD_BYTES) throw uploadTooLargeError()
    if (!snapshotFile.data.length) throw new SnapshotError('corruptedFile', 'Uploaded snapshot file is empty')

    const password = multipart.getField('password')
    const snapshot = parseEncryptedDatabaseSnapshot(snapshotFile.data, password)
    const preview = await previewDatabaseSnapshotForCurrentSchema(snapshot)
    const restoreToken = createSnapshotRestoreSession(snapshot, preview)

    return { ...preview, restoreToken }
  } catch (err: any) {
    if (err?.statusCode) throw err

    console.error('Failed to preview database snapshot:', err)
    throw createError({
      statusCode: err instanceof SnapshotError ? statusForSnapshotErrorCode(err.code) : 400,
      statusMessage: 'Failed to preview database snapshot',
      message: String(err?.message || err),
      data: err instanceof SnapshotError ? { snapshotErrorCode: err.code, snapshotErrorParams: err.params } : undefined,
    })
  }
})
