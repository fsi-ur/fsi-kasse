import * as mariadb from 'mariadb'

// Creates the restricted database user the accounting app (Buchhaltung) uses
// to read cash register data for its per-event overview. The user gets
// read-only access to exactly the tables that overview needs. Re-running the
// script is safe; it keeps the password and grants in sync.

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_NAME = 'fsi_kasse',
  DB_ROOT_PASSWORD,
  DB_SETUP_USER,
  DB_SETUP_PASSWORD,
  CONNECTION_DB_USER,
  CONNECTION_DB_PASSWORD,
} = process.env

const SELECT_TABLES = [
  'events',
  'items',
  'orders',
  'order_items',
  'fachschaft_payments',
  'app_settings',
  'donations',
  'item_price_history',
  'app_settings_history',
]

if (!CONNECTION_DB_USER || !CONNECTION_DB_PASSWORD) {
  console.log('create-connection-db-user: skipped (CONNECTION_DB_USER or CONNECTION_DB_PASSWORD not set)')
  process.exit(0)
}

const setupUser = DB_SETUP_USER || 'root'
const setupPassword = DB_SETUP_USER
  ? (DB_SETUP_PASSWORD ?? '')
  : (DB_ROOT_PASSWORD ?? '')

const databaseName = DB_NAME.replaceAll('`', '')

async function createConnectionUser() {
  const pool = mariadb.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: setupUser,
    password: setupPassword,
    connectionLimit: 1,
  })

  let conn

  try {
    conn = await pool.getConnection()

    await conn.query(`CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`, [CONNECTION_DB_USER, CONNECTION_DB_PASSWORD])
    await conn.query(`ALTER USER ?@'%' IDENTIFIED BY ?`, [CONNECTION_DB_USER, CONNECTION_DB_PASSWORD])

    try {
      await conn.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@'%'`, [CONNECTION_DB_USER])
    } catch {
      // No existing grants to revoke.
    }

    for (const table of SELECT_TABLES) {
      await conn.query(`GRANT SELECT ON \`${databaseName}\`.\`${table}\` TO ?@'%'`, [CONNECTION_DB_USER])
    }

    console.log(
      `create-connection-db-user: user "${CONNECTION_DB_USER}" is set up ` +
      `(SELECT on ${SELECT_TABLES.join(', ')})`,
    )
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

createConnectionUser().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `create-connection-db-user: database authentication failed for setup user "${setupUser}". ` +
      'Check DB_SETUP_USER/DB_SETUP_PASSWORD (or DB_ROOT_PASSWORD) in .env.',
    )
  }

  console.error('create-connection-db-user: failed', error)
  process.exit(1)
})
