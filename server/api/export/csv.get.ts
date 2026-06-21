import { defineEventHandler, setHeader } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const orderRows = await query(`
    SELECT
      o.id AS order_id,
      e.name AS event,
      o.created_at,
      o.fachschaft,
      c.name AS cashier,
      i.name AS item,
      oi.quantity,
      i.price,
      IFNULL(i.deposit, 0) AS deposit
    FROM orders o
    JOIN cashiers c ON o.cashier_id = c.id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN items i ON oi.item_id = i.id
    JOIN events e ON e.id = o.event_id
    ORDER BY o.created_at DESC
  `)

  const donationRows = await query(`
    SELECT
      d.id AS donation_id,
      e.name AS event,
      d.created_at,
      c.name AS cashier,
      d.amount,
      d.order_id
    FROM donations d
    JOIN cashiers c ON d.cashier_id = c.id
    JOIN events e ON d.event_id = e.id
    ORDER BY d.created_at DESC
  `)

  let csv = 'Order ID,Event,Date,Cashier,Fachschaft,Item,Quantity,Price,Deposit,Total'

  for (const row of orderRows as any[]) {
    const total =
      row.fachschaft === 1
        ? 0
        : (Number(row.price) + Number(row.deposit)) * Number(row.quantity)

    csv += `\n${[
      row.order_id,
      `"${row.event}"`,
      new Date(row.created_at).toISOString(),
      `"${row.cashier}"`,
      row.fachschaft,
      `"${row.item}"`,
      row.quantity,
      row.price,
      row.deposit,
      total.toFixed(2)
    ].join(',')}`
  }

  csv += '\n\nDonation ID,Event,Date,Cashier,Amount,Linked Order ID'

  for (const row of donationRows as any[]) {
    csv += `\n${[
      row.donation_id,
      `"${row.event}"`,
      new Date(row.created_at).toISOString(),
      `"${row.cashier}"`,
      Number(row.amount).toFixed(2),
      row.order_id ?? ''
    ].join(',')}`
  }

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="export.csv"')

  return csv
})
