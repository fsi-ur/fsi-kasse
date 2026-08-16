import crypto from 'crypto'
import { SnapshotError, type DatabaseSnapshot, type SnapshotPreview } from '~/server/utils/databaseSnapshots'

const RESTORE_SESSION_MAX_AGE_MS = 15 * 60 * 1000

interface SnapshotRestoreSession {
  snapshot: DatabaseSnapshot
  preview: SnapshotPreview
  createdAt: number
}

const restoreSessions = new Map<string, SnapshotRestoreSession>()

function pruneRestoreSessions() {
  const expiresBefore = Date.now() - RESTORE_SESSION_MAX_AGE_MS
  for (const [token, session] of restoreSessions.entries()) {
    if (session.createdAt < expiresBefore) restoreSessions.delete(token)
  }
}

export function createSnapshotRestoreSession(snapshot: DatabaseSnapshot, preview: SnapshotPreview) {
  pruneRestoreSessions()
  const token = crypto.randomBytes(32).toString('base64url')
  restoreSessions.set(token, { snapshot, preview, createdAt: Date.now() })
  return token
}

export function getSnapshotRestoreSession(tokenValue: unknown) {
  pruneRestoreSessions()
  const token = String(tokenValue || '')
  const session = restoreSessions.get(token)
  if (!session) throw new SnapshotError('previewExpired', 'Restore preview has expired')
  return session
}

export function consumeSnapshotRestoreSession(tokenValue: unknown) {
  const token = String(tokenValue || '')
  const session = getSnapshotRestoreSession(token)
  restoreSessions.delete(token)
  return session
}
