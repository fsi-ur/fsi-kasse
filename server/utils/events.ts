import { accountingQuery, isConnectedAccountingMode, query, withTransaction } from '~/server/utils/db'

interface LocalEventRow {
  id: number
  name: string
  starts_at: string
  ends_at: string
  is_active: number
  fachschaft_enabled: number
}

interface LocalEventProxyRow {
  id: number
  accounting_event_id: number
  fachschaft_enabled: number
}

interface AccountingEventRow {
  id: number
  name: string
  starts_at: string
  ends_at: string
  is_active: number
}

export interface CashRegisterEvent {
  id: number
  name: string
  starts_at: string
  ends_at: string
  is_active: number
  fachschaft_enabled: number
}

async function loadAccountingEvents() {
  return accountingQuery<AccountingEventRow[]>(
    `SELECT
       id,
       name,
       starts_at,
       ends_at,
       1 AS is_active
     FROM events
     ORDER BY name ASC, starts_at ASC, id ASC`,
  )
}

async function syncConnectedEventProxies(accountingEvents: AccountingEventRow[]) {
  if (!accountingEvents.length) return

  const accountingIds = accountingEvents.map(event => Number(event.id))
  const existingProxyRows = await query<LocalEventProxyRow[]>(
    `SELECT id, accounting_event_id
     FROM events
     WHERE accounting_event_id IN (${accountingIds.map(() => '?').join(',')})`,
    accountingIds,
  )

  const proxyIdByAccountingId = new Map<number, number>()
  for (const row of existingProxyRows) {
    proxyIdByAccountingId.set(Number(row.accounting_event_id), Number(row.id))
  }

  await withTransaction(async (conn) => {
    for (const accountingEvent of accountingEvents) {
      const accountingEventId = Number(accountingEvent.id)
      const existingProxyId = proxyIdByAccountingId.get(accountingEventId)

      if (existingProxyId) {
        await query(
          `UPDATE events
           SET name = ?, starts_at = ?, ends_at = ?, is_active = ?
           WHERE id = ?`,
          [String(accountingEvent.name), String(accountingEvent.starts_at), String(accountingEvent.ends_at), Number(accountingEvent.is_active), existingProxyId],
          conn,
        )
        continue
      }

      const insertResult: any = await query(
        `INSERT INTO events (name, starts_at, ends_at, accounting_event_id, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [String(accountingEvent.name), String(accountingEvent.starts_at), String(accountingEvent.ends_at), accountingEventId, Number(accountingEvent.is_active)],
        conn,
      )

      proxyIdByAccountingId.set(accountingEventId, Number(insertResult.insertId))
    }
  })
}

export async function getCashRegisterEvents(): Promise<CashRegisterEvent[]> {
  if (!isConnectedAccountingMode()) {
    const rows = await query<LocalEventRow[]>(
      `SELECT id, name, starts_at, ends_at, is_active, fachschaft_enabled
       FROM events
       ORDER BY name ASC`,
    )

    return rows.map(row => ({
      id: Number(row.id),
      name: String(row.name),
      starts_at: String(row.starts_at),
      ends_at: String(row.ends_at),
      is_active: Number(row.is_active),
      fachschaft_enabled: Number(row.fachschaft_enabled),
    }))
  }

  const accountingEvents = await loadAccountingEvents()
  await syncConnectedEventProxies(accountingEvents)

  if (!accountingEvents.length) return []

  const accountingIds = accountingEvents.map(event => Number(event.id))
  const proxyRows = await query<LocalEventProxyRow[]>(
    `SELECT id, accounting_event_id, fachschaft_enabled
     FROM events
     WHERE accounting_event_id IN (${accountingIds.map(() => '?').join(',')})`,
    accountingIds,
  )

  const localIdByAccountingId = new Map<number, number>()
  const fachschaftByAccountingId = new Map<number, number>()
  for (const row of proxyRows) {
    localIdByAccountingId.set(Number(row.accounting_event_id), Number(row.id))
    fachschaftByAccountingId.set(Number(row.accounting_event_id), Number(row.fachschaft_enabled))
  }

  return accountingEvents.flatMap((accountingEvent) => {
    const localId = localIdByAccountingId.get(Number(accountingEvent.id))
    if (!localId) return []

    return [{
      id: localId,
      name: String(accountingEvent.name),
      starts_at: String(accountingEvent.starts_at),
      ends_at: String(accountingEvent.ends_at),
      is_active: Number(accountingEvent.is_active),
      fachschaft_enabled: fachschaftByAccountingId.get(Number(accountingEvent.id)) ?? 1,
    }]
  })
}

export async function getCashRegisterEventById(eventId: number): Promise<CashRegisterEvent | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null

  if (!isConnectedAccountingMode()) {
    const rows = await query<LocalEventRow[]>(
      `SELECT id, name, starts_at, ends_at, is_active, fachschaft_enabled
       FROM events
       WHERE id = ?
       LIMIT 1`,
      [eventId],
    )

    if (!rows[0]) return null

    return {
      id: Number(rows[0].id),
      name: String(rows[0].name),
      starts_at: String(rows[0].starts_at),
      ends_at: String(rows[0].ends_at),
      is_active: Number(rows[0].is_active),
      fachschaft_enabled: Number(rows[0].fachschaft_enabled),
    }
  }

  const events = await getCashRegisterEvents()
  return events.find(event => event.id === eventId) ?? null
}
