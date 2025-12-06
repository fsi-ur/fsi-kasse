import crypto from 'crypto'
import { query } from './db'
import bcrypt from 'bcrypt'

const {
  SESSION_SECRET,
  SESSION_INACTIVITY_MINUTES = '30',
  SESSION_MAX_AGE_MINUTES = '1440'
} = process.env

if (!SESSION_SECRET) throw new Error('Missing SESSION_SECRET env var')

export const inactivityMinutes = parseInt(SESSION_INACTIVITY_MINUTES as string)
export const maxAgeMinutes = parseInt(SESSION_MAX_AGE_MINUTES as string)

export function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hmacToken(token: string) {
  return crypto.createHmac('sha256', SESSION_SECRET as string).update(token).digest('hex')
}

export async function hashPassword(password: string) {
  const saltRounds = 12
  return bcrypt.hash(password, saltRounds)
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createSession(userId: number, token: string) {
  const tokenHash = hmacToken(token)
  const now = new Date()
  const lastActiveAt = now.toISOString().slice(0, 19).replace('T', ' ')
  const createdAt = lastActiveAt

  const expires = new Date(Date.now() + maxAgeMinutes * 60 * 1000)
  const expiresAt = expires.toISOString().slice(0, 19).replace('T', ' ')

  const res = await query(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_active_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenHash, createdAt, lastActiveAt, expiresAt]
  )

  return true
}

export async function getSessionByToken(token: string) {
  const tokenHash = hmacToken(token)
  const rows = await query(
    `SELECT s.*, u.username, u.role, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [tokenHash]
  )
  const arr = rows as any[]
  return arr[0] || null
}

export async function touchSession(token: string) {
  const tokenHash = hmacToken(token)
  const now = new Date()
  const lastActiveAt = now.toISOString().slice(0, 19).replace('T', ' ')

  const res = await query(
    `UPDATE sessions SET last_active_at = ? WHERE token_hash = ?`,
    [lastActiveAt, tokenHash]
  )
  return true
}

export async function deleteSessionByToken(token: string) {
  const tokenHash = hmacToken(token)
  await query(`DELETE FROM sessions WHERE token_hash = ?`, [tokenHash])
}

export async function cleanupExpiredSessions() {
  await query(`DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()`)
}