import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS stands (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stand_items (
    stand_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (stand_id, item_id),
    INDEX idx_stand_items_item (item_id),
    FOREIGN KEY (stand_id) REFERENCES stands(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  )`,
]

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for stands migration')
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

async function migrateStands() {
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

    for (const statement of CREATE_TABLES) {
      await conn.query(statement)
    }

    for (const tableName of ['orders', 'donations']) {
      if (!await columnExists(conn, databaseName, tableName, 'stand_id')) {
        await conn.query(`ALTER TABLE ${tableName} ADD COLUMN stand_id BIGINT UNSIGNED NULL`)
        console.log(`migrate-stands: added ${tableName}.stand_id`)
      }

      const constraintName = `fk_${tableName}_stand`
      if (!await constraintExists(conn, databaseName, tableName, constraintName)) {
        await conn.query(
          `ALTER TABLE ${tableName}
           ADD CONSTRAINT ${constraintName}
           FOREIGN KEY (stand_id) REFERENCES stands(id)`,
        )
        console.log(`migrate-stands: added ${constraintName}`)
      }
    }

    if (!await indexExists(conn, databaseName, 'orders', 'idx_orders_event_stand')) {
      await conn.query('ALTER TABLE orders ADD INDEX idx_orders_event_stand (event_id, stand_id)')
      console.log('migrate-stands: added idx_orders_event_stand')
    }

    console.log('migrate-stands: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateStands().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-stands: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-stands: failed', error)
  process.exit(1)
})
