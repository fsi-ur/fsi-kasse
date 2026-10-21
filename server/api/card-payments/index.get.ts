import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'
import { normalizeBigInt } from '~/server/utils/normalize'
import { PROBLEM_SQL, STALE_AFTER_SECONDS } from '~/server/utils/cardPayments'

const STATUSES = new Set(['created', 'processing', 'successful', 'failed', 'booked', 'booking_failed', 'resolved'])
const MAX_ROWS = 500

// Admin list of card payments. `problems=1` lists only those that need an
// admin (booking failed, stuck at the terminal); the most recent come first.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const params = getQuery(event)
  const where: string[] = []
  const values: unknown[] = []

  const eventId = Number(params.eventId)
  if (params.eventId != null && params.eventId !== '') {
    if (!Number.isInteger(eventId) || eventId <= 0) return { ok: false, error: 'Invalid eventId' }
    where.push('cp.event_id = ?')
    values.push(eventId)
  }

  if (typeof params.status === 'string' && params.status) {
    if (!STATUSES.has(params.status)) return { ok: false, error: 'Invalid status' }
    where.push('cp.status = ?')
    values.push(params.status)
  }

  if (params.problems === '1') where.push(PROBLEM_SQL)

  const rows = normalizeBigInt(await query<any[]>(
    `SELECT
       cp.client_uuid, cp.kind, cp.status, cp.event_id, cp.stand_id, cp.amount, cp.tip_amount, cp.charged_amount,
       cp.fee_amount, cp.sumup_transaction_code, cp.failure_reason, cp.booking_error, cp.resolution_note,
       cp.resolved_by, cp.started_at, cp.created_at, cp.finalized_at, cp.order_id, cp.fachschaft_payment_id,
       e.name AS event_name, s.name AS stand_name, r.name AS reader_name, c.name AS cashier_name,
       ${PROBLEM_SQL} AS is_problem,
       (cp.status IN ('created', 'processing') AND cp.created_at < CURRENT_TIMESTAMP - INTERVAL ${STALE_AFTER_SECONDS} SECOND) AS is_stale
     FROM card_payments cp
     LEFT JOIN events e ON e.id = cp.event_id
     LEFT JOIN stands s ON s.id = cp.stand_id
     LEFT JOIN card_readers r ON r.id = cp.reader_id
     LEFT JOIN cashiers c ON c.id = cp.cashier_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY cp.created_at DESC, cp.id DESC
     LIMIT ${MAX_ROWS}`,
    values,
  )) as any[]

  const toMoney = (value: unknown) => value == null ? null : Number(value)

  return {
    ok: true,
    payments: rows.map(row => ({
      client_uuid: String(row.client_uuid),
      kind: row.kind,
      status: row.status,
      event_id: Number(row.event_id),
      event_name: row.event_name ?? null,
      stand_name: row.stand_name ?? null,
      reader_name: row.reader_name ?? null,
      cashier_name: row.cashier_name ?? null,
      amount: Number(row.amount),
      tip_amount: toMoney(row.tip_amount),
      charged_amount: toMoney(row.charged_amount),
      fee_amount: toMoney(row.fee_amount),
      transaction_code: row.sumup_transaction_code ?? null,
      failure_reason: row.failure_reason ?? null,
      booking_error: row.booking_error ?? null,
      resolution_note: row.resolution_note ?? null,
      resolved_by: row.resolved_by ?? null,
      started_at: String(row.started_at),
      created_at: String(row.created_at),
      finalized_at: row.finalized_at ?? null,
      order_id: row.order_id ?? null,
      fachschaft_payment_id: row.fachschaft_payment_id ?? null,
      is_problem: Boolean(Number(row.is_problem)),
      is_stale: Boolean(Number(row.is_stale)),
    })),
  }
})
