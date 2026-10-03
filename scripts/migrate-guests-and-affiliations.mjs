import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// Every table touched here is local and owned by the till in both modes, so
// unlike the user migrations this one also runs in connected accounting mode.

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS affiliations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS guest_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    access_level ENUM('use', 'manage') NOT NULL DEFAULT 'use',
    affiliation_id BIGINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (affiliation_id) REFERENCES affiliations(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guest_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guest_user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE,
    UNIQUE KEY (token_hash)
  )`,
]

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for guests and affiliations migration')
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

async function migrateGuestsAndAffiliations() {
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

    if (!await columnExists(conn, databaseName, 'cashiers', 'is_guest')) {
      await conn.query('ALTER TABLE cashiers ADD COLUMN is_guest TINYINT(1) NOT NULL DEFAULT 0')
      console.log('migrate-guests-and-affiliations: added cashiers.is_guest')
    }

    if (!await columnExists(conn, databaseName, 'cashiers', 'affiliation_id')) {
      await conn.query('ALTER TABLE cashiers ADD COLUMN affiliation_id BIGINT UNSIGNED NULL')
      console.log('migrate-guests-and-affiliations: added cashiers.affiliation_id')
    }

    if (!await constraintExists(conn, databaseName, 'cashiers', 'fk_cashiers_affiliation')) {
      await conn.query(
        `ALTER TABLE cashiers
         ADD CONSTRAINT fk_cashiers_affiliation
         FOREIGN KEY (affiliation_id) REFERENCES affiliations(id) ON DELETE SET NULL`,
      )
      console.log('migrate-guests-and-affiliations: added fk_cashiers_affiliation')
    }

    console.log('migrate-guests-and-affiliations: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateGuestsAndAffiliations().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-guests-and-affiliations: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-guests-and-affiliations: failed', error)
  process.exit(1)
})
