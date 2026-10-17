import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// One-off clean-up for installs that booked deposit returns as an item with a
// negative price (before deposit returns were their own line kind). Turns
// those order lines into `deposit_return` lines — unit_price 0, the negative
// price as unit_deposit — so the cash of every order stays exactly the same,
// but the returns leave the item statistics and show up in the deposit
// figures. The negative-price items are deactivated afterwards.
//
// Rewrites past orders, so it is not part of setup-deploy: it only reports
// what it would change unless started with --apply.
//
//   npm run setup:convert-negative-deposit-items            (dry run)
//   npm run setup:convert-negative-deposit-items -- --apply

const APPLY = process.argv.includes('--apply')
const DEPOSIT_RETURN_NAME = 'Pfandrückgabe'

async function convert() {
  const pool = mariadb.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: Number(DB_CONN_LIMIT),
  })

  let conn

  try {
    conn = await pool.getConnection()

    const kindType = await conn.query(
      `SELECT COLUMN_TYPE AS column_type
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'line_kind'`,
    )
    if (!String(kindType[0]?.column_type ?? '').includes(`'deposit_return'`)) {
      throw new Error('order_items.line_kind does not know deposit_return yet — run migrate-deposit-returns.mjs first')
    }

    const items = await conn.query(`SELECT id, name, price, is_active FROM items WHERE price < 0 ORDER BY id`)
    if (!items.length) {
      console.log('convert-negative-deposit-items: no items with a negative price — nothing to do')
      return
    }

    const ids = items.map(item => Number(item.id))
    const placeholders = ids.map(() => '?').join(', ')
    // Only plain sale lines charged at a negative price without deposit are returns.
    const lineFilter = `item_id IN (${placeholders}) AND line_kind = 'item' AND unit_price < 0 AND unit_deposit = 0`

    const orderLines = await conn.query(
      `SELECT item_id, COUNT(*) AS lines_count, SUM(quantity) AS quantity, SUM(quantity * unit_price) AS amount
       FROM order_items WHERE ${lineFilter} GROUP BY item_id`,
      ids,
    )
    const requestLines = await conn.query(
      `SELECT COUNT(*) AS lines_count FROM order_change_request_lines WHERE ${lineFilter}`,
      ids,
    )

    const byItem = new Map(orderLines.map(row => [Number(row.item_id), row]))
    for (const item of items) {
      const row = byItem.get(Number(item.id))
      console.log(
        `convert-negative-deposit-items: item #${item.id} "${item.name}" (${Number(item.price).toFixed(2)}) — `
        + `${Number(row?.lines_count ?? 0)} order lines, ${Number(row?.quantity ?? 0)} returns, `
        + `${Number(row?.amount ?? 0).toFixed(2)} paid back`,
      )
    }
    console.log(`convert-negative-deposit-items: ${Number(requestLines[0]?.lines_count ?? 0)} change request lines`)

    if (!APPLY) {
      console.log('convert-negative-deposit-items: dry run — start with --apply to convert')
      return
    }

    await conn.beginTransaction()
    try {
      for (const table of ['order_items', 'order_change_request_lines']) {
        const result = await conn.query(
          `UPDATE ${table}
           SET line_kind = 'deposit_return', unit_deposit = unit_price, unit_price = 0, item_id = NULL, item_name = ?
           WHERE ${lineFilter}`,
          [DEPOSIT_RETURN_NAME, ...ids],
        )
        console.log(`convert-negative-deposit-items: converted ${Number(result.affectedRows)} rows of ${table}`)
      }
      await conn.query(`UPDATE items SET is_active = 0 WHERE id IN (${placeholders})`, ids)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    }

    console.log(`convert-negative-deposit-items: deactivated ${ids.length} items — complete`)
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

convert().catch((error) => {
  console.error('convert-negative-deposit-items: failed', error)
  process.exit(1)
})
