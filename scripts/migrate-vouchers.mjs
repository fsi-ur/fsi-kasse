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
  ['item_groups', `CREATE TABLE IF NOT EXISTS item_groups (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`],
  ['item_group_items', `CREATE TABLE IF NOT EXISTS item_group_items (
    group_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (group_id, item_id),
    INDEX idx_item_group_items_item (item_id),
    FOREIGN KEY (group_id) REFERENCES item_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  )`],
  ['voucher_batches', `CREATE TABLE IF NOT EXISTS voucher_batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    kind ENUM('paid', 'free') NOT NULL,
    item_group_id BIGINT UNSIGNED NOT NULL,
    units_per_voucher INT NOT NULL,
    sale_price DECIMAL(10,2) NULL,
    includes_deposit TINYINT(1) NOT NULL DEFAULT 0,
    event_id BIGINT UNSIGNED NULL,
    valid_until DATETIME NULL,
    note TEXT NULL,
    pdf_layout LONGTEXT NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_group_id) REFERENCES item_groups(id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
  )`],
  ['vouchers', `CREATE TABLE IF NOT EXISTS vouchers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT UNSIGNED NOT NULL,
    code CHAR(11) NOT NULL,
    status ENUM('unsold', 'active', 'revoked') NOT NULL,
    units_total INT NOT NULL,
    units_remaining INT NOT NULL,
    sold_order_id BIGINT UNSIGNED NULL,
    sold_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    revoked_by VARCHAR(255) NULL,
    revoke_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vouchers_code (code),
    INDEX idx_vouchers_batch (batch_id, status),
    FOREIGN KEY (batch_id) REFERENCES voucher_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (sold_order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT chk_vouchers_units CHECK (units_remaining >= 0 AND units_remaining <= units_total)
  )`],
]

const LINE_TABLES = [
  { table: 'order_items', constraint: 'fk_order_items_voucher', onDelete: '', index: 'idx_order_items_voucher' },
  { table: 'order_change_request_lines', constraint: 'fk_order_change_request_lines_voucher', onDelete: ' ON DELETE SET NULL', index: null },
]

const LINE_COLUMNS = [
  ['line_kind', `ENUM('item', 'voucher_redemption', 'voucher_sale') NOT NULL DEFAULT 'item'`],
  ['voucher_id', 'BIGINT UNSIGNED NULL'],
  ['voucher_covers_deposit', 'TINYINT(1) NOT NULL DEFAULT 0'],
]

async function tableExists(conn, tableName) {
  const rows = await conn.query(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName],
  )

  return Boolean(rows[0]?.table_name)
}

async function columnExists(conn, tableName, columnName) {
  const rows = await conn.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  )

  return Boolean(rows[0]?.column_name)
}

async function constraintExists(conn, tableName, constraintName) {
  const rows = await conn.query(
    `SELECT CONSTRAINT_NAME AS constraint_name
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [tableName, constraintName],
  )

  return Boolean(rows[0]?.constraint_name)
}

async function indexExists(conn, tableName, indexName) {
  const rows = await conn.query(
    `SELECT INDEX_NAME AS index_name
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName],
  )

  return Boolean(rows[0]?.index_name)
}

async function migrateVouchers() {
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

    for (const [tableName, statement] of CREATE_TABLES) {
      if (await tableExists(conn, tableName)) continue

      await conn.query(statement)
      console.log(`migrate-vouchers: created ${tableName}`)
    }

    for (const { table, constraint, onDelete, index } of LINE_TABLES) {
      for (const [column, definition] of LINE_COLUMNS) {
        if (await columnExists(conn, table, column)) continue

        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        console.log(`migrate-vouchers: added ${table}.${column}`)
      }

      if (index && !await indexExists(conn, table, index)) {
        await conn.query(`ALTER TABLE ${table} ADD INDEX ${index} (voucher_id)`)
        console.log(`migrate-vouchers: added ${index}`)
      }

      if (!await constraintExists(conn, table, constraint)) {
        await conn.query(
          `ALTER TABLE ${table}
           ADD CONSTRAINT ${constraint}
           FOREIGN KEY (voucher_id) REFERENCES vouchers(id)${onDelete}`,
        )
        console.log(`migrate-vouchers: added ${constraint}`)
      }
    }

    console.log('migrate-vouchers: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateVouchers().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-vouchers: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-vouchers: failed', error)
  process.exit(1)
})
