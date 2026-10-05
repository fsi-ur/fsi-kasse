import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// Orders are till-owned in both modes, so this runs regardless of ACCOUNTING_MODE.
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS order_change_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    order_client_uuid CHAR(36) NULL,
    cashier_id BIGINT UNSIGNED NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reason TEXT NULL,
    original_fachschaft TINYINT(1) NOT NULL DEFAULT 0,
    proposed_fachschaft TINYINT(1) NOT NULL DEFAULT 0,
    requested_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255) NULL,
    reviewed_at TIMESTAMP NULL,
    review_note TEXT NULL,
    INDEX idx_order_change_requests_order (order_id, status),
    INDEX idx_order_change_requests_status (status, created_at),
    INDEX idx_order_change_requests_event (event_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_change_request_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    version ENUM('original', 'proposed') NOT NULL,
    order_item_id BIGINT UNSIGNED NULL,
    item_id BIGINT UNSIGNED NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    unit_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    INDEX idx_order_change_request_lines_request (request_id, version),
    FOREIGN KEY (request_id) REFERENCES order_change_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
  )`,
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

async function migrateOrderChangeRequests() {
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

    for (const [index, statement] of CREATE_TABLES.entries()) {
      const tableName = index === 0 ? 'order_change_requests' : 'order_change_request_lines'
      if (await tableExists(conn, tableName)) continue

      await conn.query(statement)
      console.log(`migrate-order-change-requests: created ${tableName}`)
    }

    console.log('migrate-order-change-requests: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateOrderChangeRequests().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-order-change-requests: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-order-change-requests: failed', error)
  process.exit(1)
})
