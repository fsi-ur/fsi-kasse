import * as mariadb from 'mariadb'
import bcrypt from 'bcrypt'
import { runAuthRoleMigration } from './auth-role-migration.mjs'

const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  DB_HOST = 'kasse-db',
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
    let userId

    if (existing.length) {
      userId = Number(existing[0].id)
      console.log(`seed-admin: user "${ADMIN_USERNAME}" already exists`)
    } else {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
      const result = await conn.query(
        'INSERT INTO users (username, password_hash, is_active) VALUES (?, ?, 1)',
        [ADMIN_USERNAME, hash]
      )
      userId = Number(result.insertId)
      console.log(`seed-admin: created admin user "${ADMIN_USERNAME}"`)
    }

    await runAuthRoleMigration(conn, { createdByUserId: userId })

    const adminRole = await conn.query('SELECT id FROM roles WHERE code = ? LIMIT 1', ['admin'])
    if (!adminRole.length) {
      throw new Error('ADMIN_ROLE_NOT_FOUND')
    }

    await conn.query(
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, Number(adminRole[0].id)]
    )

    console.log(`seed-admin: ensured admin role for "${ADMIN_USERNAME}"`)
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('seed-admin: failed', err)
  process.exit(1)
})
