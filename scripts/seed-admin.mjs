import mariadb from 'mariadb'
import bcrypt from 'bcrypt'

const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  DB_HOST = 'db',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '5'
} = process.env

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.log('seed-admin: skipped (ADMIN_USERNAME or ADMIN_PASSWORD not set)')
  process.exit(0)
}

const pool = mariadb.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: Number(DB_CONN_LIMIT)
})

async function main() {
  let conn
  try {
    conn = await pool.getConnection()
    const existing = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [ADMIN_USERNAME])
    if (existing && existing.length) {
      console.log(`seed-admin: user "${ADMIN_USERNAME}" already exists, skipping`)
      return
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
    await conn.query(
      'INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)',
      [ADMIN_USERNAME, hash, 'admin']
    )
    console.log(`seed-admin: created admin user "${ADMIN_USERNAME}"`)
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('seed-admin: failed', err)
  process.exit(1)
})
