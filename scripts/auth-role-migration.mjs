const DEFAULT_ROLE_PERMISSIONS = {
  admin: ['cash_register.manage', 'cash_register.use'],
  user: ['cash_register.use'],
}

const ROLE_TABLES = [
  `
  CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(31) NOT NULL UNIQUE,
    name VARCHAR(127) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT UNSIGNED NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    PRIMARY KEY (role_id, permission_key),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    PRIMARY KEY (user_id, permission_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
  `,
]

async function tableExists(conn, tableName) {
  const rows = await conn.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    LIMIT 1
    `,
    [tableName],
  )

  return Boolean(rows.length)
}

async function columnExists(conn, tableName, columnName) {
  const rows = await conn.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    LIMIT 1
    `,
    [tableName, columnName],
  )

  return Boolean(rows.length)
}

async function getFirstUserId(conn) {
  const rows = await conn.query('SELECT id FROM users ORDER BY id ASC LIMIT 1')
  if (!rows.length) return null
  return Number(rows[0].id)
}

async function ensureBaseRoleTables(conn) {
  for (const statement of ROLE_TABLES) {
    await conn.query(statement)
  }
}

async function ensureRole(conn, role, createdBy) {
  const existing = await conn.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [role.code])
  let roleId = existing.length ? Number(existing[0].id) : null

  if (!roleId) {
    if (!createdBy) return null

    const result = await conn.query(
      `
      INSERT INTO roles (code, name, is_active, is_default, description, created_by)
      VALUES (?, ?, 1, ?, NULL, ?)
      `,
      [role.code, role.name, role.isDefault, createdBy],
    )

    roleId = Number(result.insertId)
  }

  for (const permissionKey of DEFAULT_ROLE_PERMISSIONS[role.code] || []) {
    await conn.query(
      `
      INSERT IGNORE INTO role_permissions (role_id, permission_key)
      VALUES (?, ?)
      `,
      [roleId, permissionKey],
    )
  }

  return roleId
}

async function migrateLegacyUserRoles(conn) {
  const hasLegacyRoleColumn = await columnExists(conn, 'users', 'role')
  if (!hasLegacyRoleColumn) return

  const legacyUsers = await conn.query(
    `
    SELECT id, role
    FROM users
    WHERE role IS NOT NULL
      AND TRIM(role) <> ''
    `,
  )

  for (const user of legacyUsers) {
    const roleCode = String(user.role).trim()
    const roleRows = await conn.query(
      'SELECT id FROM roles WHERE code = ? AND is_active = 1 LIMIT 1',
      [roleCode],
    )

    if (!roleRows.length) continue

    await conn.query(
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [Number(user.id), Number(roleRows[0].id)],
    )
  }

  await conn.query('ALTER TABLE users DROP COLUMN role')
}

export async function runAuthRoleMigration(conn) {
  const usersTableExists = await tableExists(conn, 'users')
  if (!usersTableExists) {
    console.log('auth-role-migration: skipped (users table missing)')
    return
  }

  await ensureBaseRoleTables(conn)

  const firstUserId = await getFirstUserId(conn)
  await ensureRole(conn, { code: 'admin', name: 'ADMIN', isDefault: 0 }, firstUserId)
  await ensureRole(conn, { code: 'user', name: 'USER', isDefault: 1 }, firstUserId)
  await migrateLegacyUserRoles(conn)

  console.log('auth-role-migration: complete')
}
