import * as mariadb from 'mariadb'

// Adds starts_at/ends_at DATETIME columns to the (local) events table, used
// both for standalone events and as the proxy table synced from the
// accounting app in connected mode. In connected mode, existing proxy rows
// are backfilled from the accounting database's own starts_at/ends_at
// (matched via accounting_event_id); anything left over falls back to
// created_at before the columns are made NOT NULL.

const {
  ACCOUNTING_MODE = 'standalone',
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
  ACCOUNTING_DB_HOST = 'buchhaltung-db',
  ACCOUNTING_DB_PORT = '3307',
  ACCOUNTING_DB_USER = DB_USER,
  ACCOUNTING_DB_PASSWORD = DB_PASSWORD,
  ACCOUNTING_DB_NAME = 'fsi_buchhaltung',
  ACCOUNTING_DB_CONN_LIMIT = DB_CONN_LIMIT,
} = process.env

const isConnected = ACCOUNTING_MODE.toLowerCase() === 'connected'
const TABLE_NAME = 'events'

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for event dates migration')
  }

  return databaseName
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

async function ensureNullableDateColumn(conn, databaseName, columnName) {
  const column = await getColumn(conn, databaseName, TABLE_NAME, columnName)
  if (column) return

  await conn.query(
    `ALTER TABLE ${TABLE_NAME} ADD COLUMN ${columnName} DATETIME NULL`,
  )
  console.log(`migrate-add-event-dates: added ${TABLE_NAME}.${columnName}`)
}

async function backfillFromAccounting(localConn, accountingConn) {
  const pendingRows = await localConn.query(
    `SELECT id, accounting_event_id
     FROM ${TABLE_NAME}
     WHERE accounting_event_id IS NOT NULL
       AND (starts_at IS NULL OR ends_at IS NULL)`,
  )
  if (!pendingRows.length) return

  const accountingIds = pendingRows.map(row => Number(row.accounting_event_id))
  const accountingRows = await accountingConn.query(
    `SELECT id, starts_at, ends_at
     FROM events
     WHERE id IN (${accountingIds.map(() => '?').join(',')})`,
    accountingIds,
  )

  const accountingById = new Map(accountingRows.map(row => [Number(row.id), row]))

  let updated = 0
  for (const row of pendingRows) {
    const accountingEvent = accountingById.get(Number(row.accounting_event_id))
    if (!accountingEvent) continue

    await localConn.query(
      `UPDATE ${TABLE_NAME} SET starts_at = ?, ends_at = ? WHERE id = ?`,
      [String(accountingEvent.starts_at), String(accountingEvent.ends_at), row.id],
    )
    updated++
  }

  if (updated) {
    console.log(`migrate-add-event-dates: backfilled ${updated} ${TABLE_NAME} rows from the accounting database`)
  }
}

async function backfillFromCreatedAt(conn, columnName) {
  const result = await conn.query(
    `UPDATE ${TABLE_NAME} SET ${columnName} = created_at WHERE ${columnName} IS NULL`,
  )
  if (Number(result?.affectedRows ?? 0) > 0) {
    console.log(`migrate-add-event-dates: backfilled ${TABLE_NAME}.${columnName} from created_at for ${result.affectedRows} rows`)
  }
}

async function finalizeNotNull(conn, databaseName, columnName) {
  const column = await getColumn(conn, databaseName, TABLE_NAME, columnName)
  if (column?.is_nullable === 'YES') {
    await conn.query(`ALTER TABLE ${TABLE_NAME} MODIFY ${columnName} DATETIME NOT NULL`)
    console.log(`migrate-add-event-dates: made ${TABLE_NAME}.${columnName} NOT NULL`)
  }
}

async function migrateAddEventDates() {
  const localPool = mariadb.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: Number(DB_CONN_LIMIT),
    dateStrings: true,
  })

  const accountingPool = isConnected
    ? mariadb.createPool({
        host: ACCOUNTING_DB_HOST,
        port: Number(ACCOUNTING_DB_PORT),
        user: ACCOUNTING_DB_USER,
        password: ACCOUNTING_DB_PASSWORD,
        database: ACCOUNTING_DB_NAME,
        connectionLimit: Number(ACCOUNTING_DB_CONN_LIMIT),
        dateStrings: true,
      })
    : null

  let localConn
  let accountingConn

  try {
    localConn = await localPool.getConnection()
    const databaseName = await getCurrentDatabaseName(localConn)

    await ensureNullableDateColumn(localConn, databaseName, 'starts_at')
    await ensureNullableDateColumn(localConn, databaseName, 'ends_at')

    if (isConnected) {
      accountingConn = await accountingPool.getConnection()
      await backfillFromAccounting(localConn, accountingConn)
    }

    await backfillFromCreatedAt(localConn, 'starts_at')
    await backfillFromCreatedAt(localConn, 'ends_at')

    await finalizeNotNull(localConn, databaseName, 'starts_at')
    await finalizeNotNull(localConn, databaseName, 'ends_at')

    console.log('migrate-add-event-dates: complete')
  } finally {
    if (localConn) localConn.release()
    if (accountingConn) accountingConn.release()
    await localPool.end()
    if (accountingPool) await accountingPool.end()
  }
}

migrateAddEventDates().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-add-event-dates: database authentication failed. ` +
      'Check DB_HOST/DB_PORT/DB_NAME (and ACCOUNTING_DB_* in connected mode) and their password values in .env.',
    )
  }

  console.error('migrate-add-event-dates: failed', error)
  process.exit(1)
})
