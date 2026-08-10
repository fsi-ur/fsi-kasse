import * as mariadb from 'mariadb'

const {
  ACCOUNTING_MODE = 'standalone',
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

const TABLE_NAME = 'users'
const COLUMN_NAME = 'must_change_password'

// In connected mode the users table lives in the accounting database and is
// owned by the accounting application, which runs its own migration for it.
if (ACCOUNTING_MODE.toLowerCase() === 'connected') {
  console.log('migrate-must-change-password: skipped (connected accounting mode)')
  process.exit(0)
}

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for must_change_password migration')
  }

  return databaseName
}

async function columnExists(conn, databaseName, tableName, columnName) {
  const rows = await conn.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, columnName],
  )

  return Boolean(rows[0]?.column_name)
}

async function migrateMustChangePassword() {
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

    if (await columnExists(conn, databaseName, TABLE_NAME, COLUMN_NAME)) {
      console.log('migrate-must-change-password: complete')
      return
    }

    await conn.query(
      `ALTER TABLE ${TABLE_NAME} ADD COLUMN ${COLUMN_NAME} TINYINT(1) NOT NULL DEFAULT 0`,
    )
    console.log(`migrate-must-change-password: added ${TABLE_NAME}.${COLUMN_NAME}`)
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateMustChangePassword().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-must-change-password: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-must-change-password: failed', error)
  process.exit(1)
})
