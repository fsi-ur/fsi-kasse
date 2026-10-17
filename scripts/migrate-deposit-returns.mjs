import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// Deposit returns are order lines of their own kind (see server/utils/deposits.ts).
const LINE_KIND_DEFINITION = `ENUM('item', 'voucher_redemption', 'voucher_sale', 'deposit_return') NOT NULL DEFAULT 'item'`
const LINE_TABLES = ['order_items', 'order_change_request_lines']

// What a voucher batch does with the deposit of redeemed items (utils/voucherDeposit.ts).
// Replaces the includes_deposit flag, which is kept in sync for older readers.
const DEPOSIT_MODE_DEFINITION = `ENUM('customer', 'covered', 'none') NOT NULL DEFAULT 'customer'`

async function columnType(conn, tableName, columnName) {
  const rows = await conn.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  )

  return rows[0]?.column_type == null ? null : String(rows[0].column_type)
}

async function migrateDepositReturns() {
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

    for (const table of LINE_TABLES) {
      const type = await columnType(conn, table, 'line_kind')
      if (type == null) {
        throw new Error(`${table}.line_kind is missing — run the vouchers migration first`)
      }
      if (type.includes(`'deposit_return'`)) continue

      await conn.query(`ALTER TABLE ${table} MODIFY COLUMN line_kind ${LINE_KIND_DEFINITION}`)
      console.log(`migrate-deposit-returns: extended ${table}.line_kind`)
    }

    if (await columnType(conn, 'voucher_batches', 'deposit_mode') == null) {
      await conn.query(`ALTER TABLE voucher_batches ADD COLUMN deposit_mode ${DEPOSIT_MODE_DEFINITION} AFTER includes_deposit`)
      const result = await conn.query(`UPDATE voucher_batches SET deposit_mode = 'covered' WHERE includes_deposit = 1`)
      console.log(`migrate-deposit-returns: added voucher_batches.deposit_mode (${Number(result.affectedRows)} batches cover the deposit)`)
    }

    console.log('migrate-deposit-returns: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateDepositReturns().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-deposit-returns: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-deposit-returns: failed', error)
  process.exit(1)
})
