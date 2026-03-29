import { accountingQuery, isConnectedAccountingMode, query, withTransaction } from '~/server/utils/db'

interface LocalCashierRow {
  id: number
  name: string
  image: string | null
  is_active: number
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
    const rows = await query<LocalCashierRow[]>(
      `SELECT id, name, image, is_active
       FROM cashiers
       ORDER BY name ASC`,
    )

    return rows.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      image: row.image ? String(row.image) : null,
      is_active: Number(row.is_active),
    }))
  }

  const accountingMembers = await loadAccountingMembers()
  await syncConnectedCashierProxies(accountingMembers)

  if (!accountingMembers.length) return []

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

  return accountingMembers.flatMap((accountingMember) => {
    const localId = localIdByAccountingMemberId.get(Number(accountingMember.id))
    if (!localId) return []

    return [{
      id: localId,
      name: String(accountingMember.name),
      image: null,
      is_active: Number(accountingMember.is_active),
    }]
  })
}

export async function getCashRegisterCashierById(cashierId: number): Promise<CashRegisterCashier | null> {
  if (!Number.isInteger(cashierId) || cashierId <= 0) return null

  if (!isConnectedAccountingMode()) {
    const rows = await query<LocalCashierRow[]>(
      `SELECT id, name, image, is_active
       FROM cashiers
       WHERE id = ?
       LIMIT 1`,
      [cashierId],
    )

    if (!rows[0]) return null

    return {
      id: Number(rows[0].id),
      name: String(rows[0].name),
      image: rows[0].image ? String(rows[0].image) : null,
      is_active: Number(rows[0].is_active),
    }
  }

  const cashiers = await getCashRegisterCashiers()
  return cashiers.find(cashier => cashier.id === cashierId) ?? null
}
