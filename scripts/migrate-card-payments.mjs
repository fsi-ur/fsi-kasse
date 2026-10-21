import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// SumUp card payments (server/utils/cardPayments.ts). Everything here is
// till-owned in both accounting modes — the local events row carries the
// per-event flag like fachschaft_enabled.
const PAYMENT_METHOD_DEFINITION = `ENUM('cash', 'card') NOT NULL DEFAULT 'cash'`
const PAYMENT_METHOD_TABLES = ['orders', 'donations', 'fachschaft_payments']

const CREATE_CARD_READERS = `
CREATE TABLE IF NOT EXISTS card_readers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sumup_reader_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  device_serial VARCHAR(64) NULL,
  device_model VARCHAR(32) NULL,
  pairing_status VARCHAR(16) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  paired_by_affiliation_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`

const CREATE_CARD_PAYMENTS = `
CREATE TABLE IF NOT EXISTS card_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_uuid CHAR(36) NOT NULL UNIQUE,
  kind ENUM('checkout', 'fachschaft_payment') NOT NULL,
  status ENUM('created', 'processing', 'successful', 'failed', 'booked', 'booking_failed', 'resolved') NOT NULL,
  reader_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  stand_id BIGINT UNSIGNED NULL,
  cashier_id BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tip_amount DECIMAL(10,2) NULL,
  charged_amount DECIMAL(10,2) NULL,
  fee_amount DECIMAL(10,2) NULL,
  sumup_client_transaction_id VARCHAR(64) NULL UNIQUE,
  sumup_transaction_id VARCHAR(64) NULL,
  sumup_transaction_code VARCHAR(64) NULL,
  webhook_token CHAR(64) NOT NULL,
  failure_reason VARCHAR(500) NULL,
  booking_error VARCHAR(500) NULL,
  resolution_note VARCHAR(1000) NULL,
  resolved_by VARCHAR(255) NULL,
  started_at DATETIME NOT NULL,
  last_checked_at TIMESTAMP NULL,
  finalized_at TIMESTAMP NULL,
  order_id BIGINT UNSIGNED NULL,
  fachschaft_payment_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sumup_checkout_id VARCHAR(64) NULL,
  INDEX idx_card_payments_reader_status (reader_id, status),
  INDEX idx_card_payments_event (event_id, status),
  CONSTRAINT fk_card_payments_reader FOREIGN KEY (reader_id) REFERENCES card_readers(id),
  CONSTRAINT fk_card_payments_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_card_payments_stand FOREIGN KEY (stand_id) REFERENCES stands(id) ON DELETE SET NULL,
  CONSTRAINT fk_card_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_card_payments_fachschaft_payment FOREIGN KEY (fachschaft_payment_id) REFERENCES fachschaft_payments(id) ON DELETE SET NULL
)`

async function columnExists(conn, tableName, columnName) {
  const rows = await conn.query(
    `SELECT 1 AS present
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  )
  return rows.length > 0
}

async function constraintExists(conn, tableName, constraintName) {
  const rows = await conn.query(
    `SELECT 1 AS present
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [tableName, constraintName],
  )
  return rows.length > 0
}

async function migrateCardPayments() {
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

    // Before stands, which references it.
    await conn.query(CREATE_CARD_READERS)

    // Guest managers may remove the terminals their association paired.
    if (!await columnExists(conn, 'card_readers', 'paired_by_affiliation_id')) {
      await conn.query(`ALTER TABLE card_readers ADD COLUMN paired_by_affiliation_id BIGINT UNSIGNED NULL AFTER is_active`)
      console.log('migrate-card-payments: added card_readers.paired_by_affiliation_id')
    }

    if (!await columnExists(conn, 'stands', 'card_reader_id')) {
      await conn.query(`ALTER TABLE stands ADD COLUMN card_reader_id BIGINT UNSIGNED NULL`)
      console.log('migrate-card-payments: added stands.card_reader_id')
    }
    if (!await columnExists(conn, 'stands', 'card_enabled')) {
      await conn.query(`ALTER TABLE stands ADD COLUMN card_enabled TINYINT(1) NOT NULL DEFAULT 0`)
      console.log('migrate-card-payments: added stands.card_enabled')
    }
    if (!await constraintExists(conn, 'stands', 'fk_stands_card_reader')) {
      await conn.query(`ALTER TABLE stands ADD CONSTRAINT fk_stands_card_reader FOREIGN KEY (card_reader_id) REFERENCES card_readers(id) ON DELETE SET NULL`)
      console.log('migrate-card-payments: added fk_stands_card_reader')
    }

    if (!await columnExists(conn, 'events', 'card_enabled')) {
      await conn.query(`ALTER TABLE events ADD COLUMN card_enabled TINYINT(1) NOT NULL DEFAULT 1`)
      console.log('migrate-card-payments: added events.card_enabled')
    }

    // Existing rows are cash, which the default records correctly.
    for (const table of PAYMENT_METHOD_TABLES) {
      if (await columnExists(conn, table, 'payment_method')) continue
      await conn.query(`ALTER TABLE ${table} ADD COLUMN payment_method ${PAYMENT_METHOD_DEFINITION}`)
      console.log(`migrate-card-payments: added ${table}.payment_method`)
    }

    await conn.query(CREATE_CARD_PAYMENTS)

    // The reader checkout's id: lets finalize see a checkout that expired at the terminal.
    if (!await columnExists(conn, 'card_payments', 'sumup_checkout_id')) {
      await conn.query(`ALTER TABLE card_payments ADD COLUMN sumup_checkout_id VARCHAR(64) NULL`)
      console.log('migrate-card-payments: added card_payments.sumup_checkout_id')
    }

    // Card money is settled per stand (card_payments.stand_id), no longer per association.
    if (await constraintExists(conn, 'card_payments', 'fk_card_payments_affiliation')) {
      await conn.query(`ALTER TABLE card_payments DROP FOREIGN KEY fk_card_payments_affiliation`)
      console.log('migrate-card-payments: dropped fk_card_payments_affiliation')
    }
    if (await columnExists(conn, 'card_payments', 'affiliation_id')) {
      await conn.query(`ALTER TABLE card_payments DROP COLUMN affiliation_id`)
      console.log('migrate-card-payments: dropped card_payments.affiliation_id')
    }

    console.log('migrate-card-payments: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateCardPayments().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-card-payments: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-card-payments: failed', error)
  process.exit(1)
})
