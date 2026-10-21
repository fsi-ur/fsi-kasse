import { query } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'
import { getActorScope } from '~/server/utils/affiliations'
import { hasPermission } from '~/server/utils/api/guards'
import type { User } from '~/types/user'

/** A reader removed at SumUp; the row stays because card payments reference it. */
export const DELETED_PAIRING_STATUS = 'deleted'

export interface CardReader {
  id: number
  sumup_reader_id: string
  name: string
  device_serial: string | null
  device_model: string | null
  pairing_status: string
  is_active: boolean
  /** The guest association whose manager paired it; null = paired by an admin. */
  paired_by_affiliation_id: number | null
  paired_by_affiliation_name: string | null
  created_at: string
  /** Stands this terminal is assigned to. */
  stands: Array<{ id: number, name: string }>
}

export async function listCardReaders(options: { includeDeleted?: boolean } = {}): Promise<CardReader[]> {
  const rows = normalizeBigInt(await query<any[]>(
    `SELECT r.id, r.sumup_reader_id, r.name, r.device_serial, r.device_model, r.pairing_status, r.is_active,
       r.paired_by_affiliation_id, a.name AS paired_by_affiliation_name, r.created_at
     FROM card_readers r
     LEFT JOIN affiliations a ON a.id = r.paired_by_affiliation_id
     ${options.includeDeleted ? '' : 'WHERE r.pairing_status <> ?'}
     ORDER BY r.name ASC, r.id ASC`,
    options.includeDeleted ? [] : [DELETED_PAIRING_STATUS],
  )) as any[]

  const standRows = await query<Array<{ id: unknown, name: unknown, card_reader_id: unknown }>>(
    `SELECT id, name, card_reader_id FROM stands WHERE card_reader_id IS NOT NULL ORDER BY name ASC`,
  )
  const standsByReader = new Map<number, Array<{ id: number, name: string }>>()
  for (const stand of standRows) {
    const readerId = Number(stand.card_reader_id)
    if (!standsByReader.has(readerId)) standsByReader.set(readerId, [])
    standsByReader.get(readerId)!.push({ id: Number(stand.id), name: String(stand.name) })
  }

  return rows.map(row => ({
    id: Number(row.id),
    sumup_reader_id: String(row.sumup_reader_id),
    name: String(row.name),
    device_serial: row.device_serial ?? null,
    device_model: row.device_model ?? null,
    pairing_status: String(row.pairing_status),
    is_active: Number(row.is_active) === 1,
    paired_by_affiliation_id: row.paired_by_affiliation_id == null ? null : Number(row.paired_by_affiliation_id),
    paired_by_affiliation_name: row.paired_by_affiliation_name ?? null,
    created_at: String(row.created_at),
    stands: standsByReader.get(Number(row.id)) ?? [],
  }))
}

export async function getCardReader(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null
  return (await listCardReaders({ includeDeleted: true })).find(reader => reader.id === id) ?? null
}

/** A terminal a stand may be assigned to: active and paired. */
export async function isAssignableReader(id: number) {
  const reader = await getCardReader(id)
  return Boolean(reader && reader.is_active && reader.pairing_status === 'paired')
}

/** Admins remove every terminal; a guest manager only those their own association paired. */
export function canRemoveReader(user: User, reader: Pick<CardReader, 'paired_by_affiliation_id'>) {
  if (hasPermission(user, 'cash_register.manage')) return true
  const scope = getActorScope(user)
  return scope != null && reader.paired_by_affiliation_id === scope
}

export function parseReaderName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 255) return null
  return name
}

/** Firmware versions as numbers for comparison ('3.3.39.0' → [3,3,39,0]). */
export function firmwareAtLeast(version: string | null, minimum: string) {
  if (!version) return null
  const a = version.split('.').map(Number)
  const b = minimum.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (Number.isNaN(diff)) return null
    if (diff !== 0) return diff > 0
  }
  return true
}
