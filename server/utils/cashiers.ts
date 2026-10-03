import type { User } from '~/types/user'
import { accountingQuery, isConnectedAccountingMode, query, withTransaction } from '~/server/utils/db'
import { canAccessAffiliation } from '~/server/utils/affiliations'

interface LocalCashierRow {
  id: number
  name: string
  image: string | null
  is_active: number
  is_guest: number
  affiliation_id: number | null
  affiliation_name: string | null
}

interface LocalCashierProxyRow {
  id: number
  accounting_member_id: number
}

interface AccountingMemberRow {
  id: number
  name: string
  is_active: number
}

export interface CashRegisterCashier {
  id: number
  name: string
  image: string | null
  is_active: number
  is_guest: boolean
  affiliation_id: number | null
  affiliation_name: string | null
}

const LOCAL_CASHIER_SELECT = `
  SELECT c.id, c.name, c.image, c.is_active, c.is_guest, c.affiliation_id, a.name AS affiliation_name
  FROM cashiers c
  LEFT JOIN affiliations a ON a.id = c.affiliation_id`

function mapLocalCashierRow(row: LocalCashierRow): CashRegisterCashier {
  return {
    id: Number(row.id),
    name: String(row.name),
    image: row.image ? String(row.image) : null,
    is_active: Number(row.is_active),
    is_guest: Number(row.is_guest) === 1,
    affiliation_id: row.affiliation_id == null ? null : Number(row.affiliation_id),
    affiliation_name: row.affiliation_name == null ? null : String(row.affiliation_name),
  }
}

/** Guest cashiers are till-owned in both modes and never touched by the accounting sync. */
async function loadGuestCashiers() {
  const rows = await query<LocalCashierRow[]>(`${LOCAL_CASHIER_SELECT} WHERE c.is_guest = 1 ORDER BY c.name ASC`)
  return rows.map(mapLocalCashierRow)
}

async function loadAccountingMembers() {
  return accountingQuery<AccountingMemberRow[]>(
    `SELECT
       id,
       TRIM(CONCAT(first_name, ' ', last_name)) AS name,
       CASE
         WHEN status = 'left' THEN 0
         ELSE 1
       END AS is_active
     FROM members
     ORDER BY last_name ASC, first_name ASC, id ASC`,
  )
}

async function syncConnectedCashierProxies(accountingMembers: AccountingMemberRow[]) {
  if (!accountingMembers.length) return

  const accountingMemberIds = accountingMembers.map(member => Number(member.id))
  const existingProxyRows = await query<LocalCashierProxyRow[]>(
    `SELECT id, accounting_member_id
     FROM cashiers
     WHERE accounting_member_id IN (${accountingMemberIds.map(() => '?').join(',')})`,
    accountingMemberIds,
  )

  const proxyIdByAccountingMemberId = new Map<number, number>()
  for (const row of existingProxyRows) {
    proxyIdByAccountingMemberId.set(Number(row.accounting_member_id), Number(row.id))
  }

  await withTransaction(async (conn) => {
    for (const accountingMember of accountingMembers) {
      const accountingMemberId = Number(accountingMember.id)
      const existingProxyId = proxyIdByAccountingMemberId.get(accountingMemberId)

      if (existingProxyId) {
        await query(
          `UPDATE cashiers
           SET name = ?, is_active = ?, image = NULL
           WHERE id = ?`,
          [String(accountingMember.name), Number(accountingMember.is_active), existingProxyId],
          conn,
        )
        continue
      }

      const insertResult: any = await query(
        `INSERT INTO cashiers (name, accounting_member_id, image, is_active)
         VALUES (?, ?, NULL, ?)`,
        [String(accountingMember.name), accountingMemberId, Number(accountingMember.is_active)],
        conn,
      )

      proxyIdByAccountingMemberId.set(accountingMemberId, Number(insertResult.insertId))
    }
  })
}

export async function getCashRegisterCashiers(): Promise<CashRegisterCashier[]> {
  if (!isConnectedAccountingMode()) {
    const rows = await query<LocalCashierRow[]>(`${LOCAL_CASHIER_SELECT} ORDER BY c.name ASC`)
    return rows.map(mapLocalCashierRow)
  }

  const accountingMembers = await loadAccountingMembers()
  await syncConnectedCashierProxies(accountingMembers)
  const guestCashiers = await loadGuestCashiers()

  if (!accountingMembers.length) return guestCashiers

  const accountingMemberIds = accountingMembers.map(member => Number(member.id))
  const proxyRows = await query<LocalCashierProxyRow[]>(
    `SELECT id, accounting_member_id
     FROM cashiers
     WHERE accounting_member_id IN (${accountingMemberIds.map(() => '?').join(',')})`,
    accountingMemberIds,
  )

  const localIdByAccountingMemberId = new Map<number, number>()
  for (const row of proxyRows) {
    localIdByAccountingMemberId.set(Number(row.accounting_member_id), Number(row.id))
  }

  const memberCashiers = accountingMembers.flatMap((accountingMember): CashRegisterCashier[] => {
    const localId = localIdByAccountingMemberId.get(Number(accountingMember.id))
    if (!localId) return []

    return [{
      id: localId,
      name: String(accountingMember.name),
      image: null,
      is_active: Number(accountingMember.is_active),
      is_guest: false,
      affiliation_id: null,
      affiliation_name: null,
    }]
  })

  return [...memberCashiers, ...guestCashiers].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function getCashRegisterCashierById(cashierId: number): Promise<CashRegisterCashier | null> {
  if (!Number.isInteger(cashierId) || cashierId <= 0) return null

  if (!isConnectedAccountingMode()) {
    const rows = await query<LocalCashierRow[]>(`${LOCAL_CASHIER_SELECT} WHERE c.id = ? LIMIT 1`, [cashierId])
    return rows[0] ? mapLocalCashierRow(rows[0]) : null
  }

  const guestCashier = await getGuestCashierById(cashierId)
  if (guestCashier) return guestCashier

  const cashiers = await getCashRegisterCashiers()
  return cashiers.find(cashier => cashier.id === cashierId) ?? null
}

export async function getGuestCashierById(cashierId: number): Promise<CashRegisterCashier | null> {
  if (!Number.isInteger(cashierId) || cashierId <= 0) return null

  const rows = await query<LocalCashierRow[]>(`${LOCAL_CASHIER_SELECT} WHERE c.id = ? AND c.is_guest = 1 LIMIT 1`, [cashierId])
  return rows[0] ? mapLocalCashierRow(rows[0]) : null
}

export async function listGuestCashiers(affiliationId?: number) {
  if (affiliationId === undefined) return loadGuestCashiers()

  const rows = await query<LocalCashierRow[]>(
    `${LOCAL_CASHIER_SELECT} WHERE c.is_guest = 1 AND c.affiliation_id = ? ORDER BY c.name ASC`,
    [affiliationId],
  )
  return rows.map(mapLocalCashierRow)
}

export async function loadManageableGuestCashier(actor: User, id: unknown) {
  const cashier = await getGuestCashierById(Number(id))
  if (!cashier || !canAccessAffiliation(actor, cashier.affiliation_id)) {
    return { ok: false as const, error: 'Gastkassierer nicht gefunden' }
  }

  return { ok: true as const, cashier }
}

export function parseCashierName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 255) return null
  return name
}
