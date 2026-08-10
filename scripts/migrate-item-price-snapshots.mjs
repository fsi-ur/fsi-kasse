import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

const LOG_PREFIX = 'migrate-item-price-snapshots'

const DEFAULT_FACHSCHAFT_PAYMENT_AMOUNT = '10.00'

async function getCurrentDatabaseName(conn) {
  const rows = await conn.query('SELECT DATABASE() AS db_name')
  const databaseName = rows[0]?.db_name?.trim()

  if (!databaseName) {
    throw new Error('Failed to resolve current database name for item price snapshot migration')
  }

  return databaseName
}

async function tableExists(conn, db, table) {
  const rows = await conn.query(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [db, table],
  )
  return Boolean(rows[0]?.t)
}

async function columnExists(conn, db, table, column) {
  const rows = await conn.query(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [db, table, column],
  )
  return Boolean(rows[0]?.c)
}

async function constraintName(conn, db, table, column) {
  const rows = await conn.query(
    `SELECT CONSTRAINT_NAME AS n FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1`,
    [db, table, column],
  )
  return rows[0]?.n || null
}

async function deleteRule(conn, db, table, constraint) {
  const rows = await conn.query(
    `SELECT DELETE_RULE AS r FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [db, table, constraint],
  )
  return rows[0]?.r || null
}

async function columnIsNullable(conn, db, table, column) {
  const rows = await conn.query(
    `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [db, table, column],
  )
  return rows[0]?.n === 'YES'
}

// Step 1: snapshot columns on order_items. Added nullable first so the backfill
// can run on a populated table before the NOT NULL constraint is applied.
async function migrateOrderItemSnapshots(conn, db) {
  const missing = []
  for (const column of ['unit_price', 'unit_deposit', 'item_name']) {
    if (!(await columnExists(conn, db, 'order_items', column))) missing.push(column)
  }

  if (missing.length > 0) {
    const additions = []
    if (missing.includes('unit_price')) additions.push('ADD COLUMN unit_price DECIMAL(10,2) NULL AFTER quantity')
    if (missing.includes('unit_deposit')) additions.push('ADD COLUMN unit_deposit DECIMAL(10,2) NULL AFTER unit_price')
    if (missing.includes('item_name')) additions.push('ADD COLUMN item_name VARCHAR(255) NULL AFTER item_id')

    await conn.query(`ALTER TABLE order_items ${additions.join(', ')}`)
  }

  // Re-run the backfill unconditionally: the columns can exist but still be
  // unpopulated if a previous run added them and then failed before finishing
  // (e.g. on a later step) — "column exists" is not proof it was backfilled.
  const backfilled = await conn.query(`
    UPDATE order_items oi
      JOIN items i ON i.id = oi.item_id
       SET oi.unit_price   = i.price,
           oi.unit_deposit = IFNULL(i.deposit, 0),
           oi.item_name    = i.name
     WHERE oi.unit_price IS NULL
  `)

  const orphaned = await conn.query(`
    UPDATE order_items
       SET unit_price = 0.00, unit_deposit = 0.00, item_name = CONCAT('#', item_id)
     WHERE unit_price IS NULL
  `)

  if (await columnIsNullable(conn, db, 'order_items', 'unit_price')) {
    await conn.query(`
      ALTER TABLE order_items
        MODIFY COLUMN unit_price DECIMAL(10,2) NOT NULL,
        MODIFY COLUMN unit_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        MODIFY COLUMN item_name VARCHAR(255) NOT NULL
    `)
  }

  const backfilledCount = Number(backfilled.affectedRows ?? 0)
  if (backfilledCount > 0) {
    console.log(
      `${LOG_PREFIX}: backfilled ${backfilledCount} order_items rows from the current item prices ` +
      '(historical prices before this migration are not recoverable)',
    )
  } else {
    console.log(`${LOG_PREFIX}: order_items snapshot columns already present and backfilled`)
  }

  const orphanCount = Number(orphaned.affectedRows ?? 0)
  if (orphanCount > 0) {
    console.log(`${LOG_PREFIX}: ${orphanCount} order_items rows had no matching item and were valued at 0.00`)
  }
}

// Step 2: item deletion must not erase order lines any more.
async function migrateOrderItemForeignKey(conn, db) {
  const existing = await constraintName(conn, db, 'order_items', 'item_id')

  if (existing && (await deleteRule(conn, db, 'order_items', existing)) === 'SET NULL') {
    console.log(`${LOG_PREFIX}: order_items.item_id already uses ON DELETE SET NULL`)
    return
  }

  if (existing) {
    await conn.query(`ALTER TABLE order_items DROP FOREIGN KEY \`${existing}\``)
  }

  await conn.query('ALTER TABLE order_items MODIFY COLUMN item_id BIGINT UNSIGNED NULL')
  await conn.query(`
    ALTER TABLE order_items
      ADD CONSTRAINT fk_order_items_item
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
  `)

  console.log(`${LOG_PREFIX}: order_items.item_id is now nullable with ON DELETE SET NULL`)
}

// Step 3: snapshot the Fachschaft payment amount on the payment row.
async function migrateFachschaftPaymentAmount(conn, db) {
  if (!(await columnExists(conn, db, 'fachschaft_payments', 'amount'))) {
    await conn.query('ALTER TABLE fachschaft_payments ADD COLUMN amount DECIMAL(10,2) NULL AFTER event_id')
  }

  // Re-run the backfill unconditionally: the column can exist but still hold
  // NULLs if a previous run added it and then failed on a later step (e.g.
  // app_settings missing) — "column exists" is not proof it was backfilled.
  // app_settings itself may not exist yet on an installation that hasn't run
  // migrate-app-settings.mjs — fall back straight to the application default
  // rather than fail the whole migration on a missing table.
  let backfilledCount = 0
  if (await tableExists(conn, db, 'app_settings')) {
    const backfilled = await conn.query(`
      UPDATE fachschaft_payments
         SET amount = (
           SELECT CASE
                    WHEN CAST(setting_value AS DECIMAL(10,2)) > 0
                      THEN CAST(setting_value AS DECIMAL(10,2))
                    ELSE ${DEFAULT_FACHSCHAFT_PAYMENT_AMOUNT}
                  END
             FROM app_settings WHERE setting_key = 'fachschaft_payment_amount'
         )
       WHERE amount IS NULL
    `)
    backfilledCount = Number(backfilled.affectedRows ?? 0)
  }

  const defaulted = await conn.query(`UPDATE fachschaft_payments SET amount = ${DEFAULT_FACHSCHAFT_PAYMENT_AMOUNT} WHERE amount IS NULL`)
  const defaultedCount = Number(defaulted.affectedRows ?? 0)

  if (await columnIsNullable(conn, db, 'fachschaft_payments', 'amount')) {
    await conn.query('ALTER TABLE fachschaft_payments MODIFY COLUMN amount DECIMAL(10,2) NOT NULL')
  }

  if (backfilledCount > 0 || defaultedCount > 0) {
    console.log(
      `${LOG_PREFIX}: backfilled ${backfilledCount} fachschaft_payments rows from the currently configured amount, ` +
      `${defaultedCount} rows defaulted to ${DEFAULT_FACHSCHAFT_PAYMENT_AMOUNT} ` +
      '(historical amounts before this migration are not recoverable)',
    )
  } else {
    console.log(`${LOG_PREFIX}: fachschaft_payments.amount already present and backfilled`)
  }
}

// Step 4: audit trail. Correctness never depends on this table.
async function migrateItemPriceHistory(conn, db) {
  if (!(await tableExists(conn, db, 'item_price_history'))) {
    await conn.query(`
      CREATE TABLE item_price_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        item_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        changed_by VARCHAR(255) NULL,
        valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_item_price_history_item (item_id, valid_from),
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      )
    `)

    console.log(`${LOG_PREFIX}: created item_price_history table`)
  }

  const seeded = await conn.query(`
    INSERT INTO item_price_history (item_id, name, price, deposit, changed_by, valid_from)
    SELECT i.id, i.name, i.price, IFNULL(i.deposit, 0), NULL, i.created_at
      FROM items i
     WHERE NOT EXISTS (SELECT 1 FROM item_price_history h WHERE h.item_id = i.id)
  `)

  const seededCount = Number(seeded.affectedRows ?? 0)
  if (seededCount > 0) {
    console.log(`${LOG_PREFIX}: seeded ${seededCount} baseline item_price_history rows`)
  }
}

// Audit trail for app_settings changes (currently just fachschaft_payment_amount).
// Correctness never depends on this table — every payment already carries its
// own amount snapshot.
async function migrateAppSettingsHistory(conn, db) {
  if (!(await tableExists(conn, db, 'app_settings_history'))) {
    await conn.query(`
      CREATE TABLE app_settings_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(127) NOT NULL,
        setting_value TEXT NULL,
        changed_by VARCHAR(255) NULL,
        valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_app_settings_history_key (setting_key, valid_from)
      )
    `)

    console.log(`${LOG_PREFIX}: created app_settings_history table`)
  }

  if (!(await tableExists(conn, db, 'app_settings'))) return

  const seeded = await conn.query(`
    INSERT INTO app_settings_history (setting_key, setting_value, changed_by)
    SELECT s.setting_key, s.setting_value, NULL
      FROM app_settings s
     WHERE NOT EXISTS (SELECT 1 FROM app_settings_history h WHERE h.setting_key = s.setting_key)
  `)

  const seededCount = Number(seeded.affectedRows ?? 0)
  if (seededCount > 0) {
    console.log(`${LOG_PREFIX}: seeded ${seededCount} baseline app_settings_history rows`)
  }
}

async function migrateItemPriceSnapshots() {
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

    await migrateOrderItemSnapshots(conn, databaseName)
    await migrateOrderItemForeignKey(conn, databaseName)
    await migrateFachschaftPaymentAmount(conn, databaseName)
    await migrateItemPriceHistory(conn, databaseName)
    await migrateAppSettingsHistory(conn, databaseName)

    console.log(`${LOG_PREFIX}: complete`)
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateItemPriceSnapshots().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `${LOG_PREFIX}: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error(`${LOG_PREFIX}: failed`, error)
  process.exit(1)
})
