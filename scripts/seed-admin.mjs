import mariadb from 'mariadb'
import bcrypt from 'bcrypt'
import { runAuthRoleMigration } from './auth-role-migration.mjs'

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
    await runAuthRoleMigration(conn)

    const existing = await conn.query('SELECT id FROM users WHERE username = ? LIMIT 1', [ADMIN_USERNAME])
    let userId

    if (existing && existing.length) {
      userId = Number(existing[0].id)
      console.log(`seed-admin: user "${ADMIN_USERNAME}" already exists, skipping`)
    } else {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
      const userResult = await conn.query(
        'INSERT INTO users (username, password_hash, is_active) VALUES (?, ?, 1)',
        [ADMIN_USERNAME, hash]
      )
      userId = Number(userResult.insertId)
      console.log(`seed-admin: created admin user "${ADMIN_USERNAME}"`)
    }

    const roleConfigs = [
      { code: 'admin', name: 'ADMIN', isDefault: 0 },
      { code: 'user', name: 'USER', isDefault: 1 },
    ]

    for (const role of roleConfigs) {
      const existingRole = await conn.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [role.code])
      let roleId

      if (existingRole && existingRole.length) {
        roleId = Number(existingRole[0].id)
      } else {
        const roleResult = await conn.query(
          'INSERT INTO roles (code, name, is_active, is_default, description, created_by) VALUES (?, ?, 1, ?, NULL, ?)',
          [role.code, role.name, role.isDefault, userId]
        )
        roleId = Number(roleResult.insertId)
      }

      if (role.code === 'admin') {
        await conn.query(
          'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [userId, roleId]
        )
      }
    }
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('seed-admin: failed', err)
  process.exit(1)
})
