import * as mariadb from 'mariadb'

// Idempotent replacement for the old "Change DB schema to support Events"
// settings button: creates the events table, adds event_id columns with
// foreign keys to orders and fachschaft_payments, and backfills existing rows
// with a default event before making the columns NOT NULL.

const {
  DB_HOST = 'db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

const DEFAULT_EVENT_NAME = 'Weihnachtsfeier'

async function tableExists(conn, databaseName, tableName) {
  const rows = await conn.query(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
     LIMIT 1`,
    [databaseName, tableName],
  )

  return Boolean(rows[0]?.table_name)
}

async function getColumn(conn, databaseName, tableName, columnName) {
  const rows = await conn.query(
    `SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, columnName],
  )

  return rows[0] || null
}

async function constraintExists(conn, databaseName, tableName, constraintName) {
  const rows = await conn.query(
    `SELECT CONSTRAINT_NAME AS constraint_name
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, constraintName],
  )

  return Boolean(rows[0]?.constraint_name)
}

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for events migration')
  }

  return databaseName
}

async function ensureDefaultEventId(conn) {
  const rows = await conn.query('SELECT id FROM events ORDER BY id ASC LIMIT 1')
  if (rows[0]) return Number(rows[0].id)

  const result = await conn.query(
    'INSERT INTO events (name, is_active) VALUES (?, 1)',
    [DEFAULT_EVENT_NAME],
  )
  console.log(`migrate-events: created default event "${DEFAULT_EVENT_NAME}"`)
  return Number(result.insertId)
}

async function ensureEventColumn(conn, databaseName, tableName, afterColumn, constraintName) {
  if (!await tableExists(conn, databaseName, tableName)) {
    console.log(`migrate-events: skipped ${tableName} (table does not exist)`)
    return
  }

  let column = await getColumn(conn, databaseName, tableName, 'event_id')
  if (!column) {
    await conn.query(
      `ALTER TABLE ${tableName} ADD COLUMN event_id BIGINT UNSIGNED NULL AFTER ${afterColumn}`,
    )
    console.log(`migrate-events: added ${tableName}.event_id column`)
    column = await getColumn(conn, databaseName, tableName, 'event_id')
  }

  if (!await constraintExists(conn, databaseName, tableName, constraintName)) {
    await conn.query(
      `ALTER TABLE ${tableName}
       ADD CONSTRAINT ${constraintName}
       FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE`,
    )
    console.log(`migrate-events: added ${constraintName} foreign key`)
  }

  const unassignedRows = await conn.query(
    `SELECT COUNT(*) AS count FROM ${tableName} WHERE event_id IS NULL`,
  )
  if (Number(unassignedRows[0]?.count ?? 0) > 0) {
    const defaultEventId = await ensureDefaultEventId(conn)
    await conn.query(
      `UPDATE ${tableName} SET event_id = ? WHERE event_id IS NULL`,
      [defaultEventId],
    )
    console.log(`migrate-events: assigned default event to ${unassignedRows[0].count} ${tableName} rows`)
  }

  if (column?.is_nullable === 'YES') {
    await conn.query(`ALTER TABLE ${tableName} MODIFY event_id BIGINT UNSIGNED NOT NULL`)
    console.log(`migrate-events: made ${tableName}.event_id NOT NULL`)
  }
}

async function migrateEvents() {
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
    const databaseName = await getCurrentDatabaseName(conn)

    if (!await tableExists(conn, databaseName, 'events')) {
      await conn.query(
        `CREATE TABLE events (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          accounting_event_id BIGINT UNSIGNED NULL UNIQUE,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      )
      console.log('migrate-events: created events table')
    }

    await ensureEventColumn(conn, databaseName, 'orders', 'fachschaft', 'fk_orders_event')
    await ensureEventColumn(conn, databaseName, 'fachschaft_payments', 'cashier_id', 'fk_fachschaft_payments_event')

    console.log('migrate-events: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateEvents().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-events: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-events: failed', error)
  process.exit(1)
})
