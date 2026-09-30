import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

const TABLES = ['orders', 'donations', 'fachschaft_payments']
const COLUMN_NAME = 'client_uuid'

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for client uuid migration')
  }

  return databaseName
}

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

async function indexExists(conn, databaseName, tableName, indexName) {
  const rows = await conn.query(
    `SELECT INDEX_NAME AS index_name
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, indexName],
  )

  return Boolean(rows[0]?.index_name)
}

async function migrateAddClientUuid() {
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
    let changed = false

    for (const tableName of TABLES) {
      if (!(await tableExists(conn, databaseName, tableName))) {
        console.log(`migrate-add-client-uuid: skipping ${tableName} (table does not exist)`)
        continue
      }

      if (!(await columnExists(conn, databaseName, tableName, COLUMN_NAME))) {
        await conn.query(`ALTER TABLE ${tableName} ADD COLUMN ${COLUMN_NAME} CHAR(36) NULL`)
        console.log(`migrate-add-client-uuid: added ${tableName}.${COLUMN_NAME}`)
        changed = true
      }

      const indexName = `uq_${tableName}_${COLUMN_NAME}`
      if (!(await indexExists(conn, databaseName, tableName, indexName))) {
        await conn.query(`ALTER TABLE ${tableName} ADD UNIQUE KEY ${indexName} (${COLUMN_NAME})`)
        console.log(`migrate-add-client-uuid: added unique key ${indexName}`)
        changed = true
      }
    }

    console.log(changed
      ? 'migrate-add-client-uuid: complete'
      : 'migrate-add-client-uuid: complete (nothing to do)')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateAddClientUuid().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-add-client-uuid: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-add-client-uuid: failed', error)
  process.exit(1)
})
