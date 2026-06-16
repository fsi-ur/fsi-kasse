import * as mariadb from 'mariadb'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const CASH_REGISTER_USE = 'cash_register.use'
const CASH_REGISTER_MANAGE = 'cash_register.manage'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '5',
  ACCOUNTING_DB_HOST = 'buchhaltung-db',
  ACCOUNTING_DB_PORT = '3307',
  ACCOUNTING_DB_USER = DB_USER,
  ACCOUNTING_DB_PASSWORD = DB_PASSWORD,
  ACCOUNTING_DB_NAME = 'fsi_buchhaltung',
  ACCOUNTING_DB_CONN_LIMIT = DB_CONN_LIMIT,
} = process.env

if (!DB_NAME || !ACCOUNTING_DB_NAME) {
  console.error('migration: DB_NAME and ACCOUNTING_DB_NAME must be set')
  process.exit(1)
}

if (
  DB_HOST === ACCOUNTING_DB_HOST &&
  DB_PORT === ACCOUNTING_DB_PORT &&
  DB_USER === ACCOUNTING_DB_USER &&
  DB_NAME === ACCOUNTING_DB_NAME
) {
  console.error('migration: source and accounting database targets must be different')
  process.exit(1)
}

const localPool = mariadb.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: Number(DB_CONN_LIMIT),
  dateStrings: true,
})

const accountingPool = mariadb.createPool({
  host: ACCOUNTING_DB_HOST,
  port: Number(ACCOUNTING_DB_PORT),
  user: ACCOUNTING_DB_USER,
  password: ACCOUNTING_DB_PASSWORD,
  database: ACCOUNTING_DB_NAME,
  connectionLimit: Number(ACCOUNTING_DB_CONN_LIMIT),
  dateStrings: true,
})

const rl = createInterface({ input, output })

function toBoolean(value) {
  return value === 1 || value === '1' || value === true
}

function permissionLevelFromSet(permissions) {
  if (permissions.has(CASH_REGISTER_MANAGE)) return 'manage'
  if (permissions.has(CASH_REGISTER_USE)) return 'use'
  return 'none'
}

function desiredPermissionsForLevel(level) {
  if (level === 'manage') return [CASH_REGISTER_MANAGE, CASH_REGISTER_USE]
  if (level === 'use') return [CASH_REGISTER_USE]
  return []
}

async function ask(question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer || defaultValue
}

async function askChoice(question, choices, defaultValue) {
  const labels = choices.map(choice => {
    if (choice === defaultValue) return `${choice}*`
    return choice
  }).join('/')

  while (true) {
    const answer = (await rl.question(`${question} (${labels}): `)).trim().toLowerCase()
    const resolved = answer || defaultValue
    if (choices.includes(resolved)) return resolved
    console.log(`Please choose one of: ${choices.join(', ')}`)
  }
}

async function confirm(question, defaultValue = true) {
  const choice = await askChoice(question, ['y', 'n'], defaultValue ? 'y' : 'n')
  return choice === 'y'
}

async function fetchUsers(conn) {
  const rows = await conn.query(
    `SELECT id, username, password_hash, is_active
     FROM users
     ORDER BY id ASC`
  )

  return rows.map(row => ({
    id: Number(row.id),
    username: String(row.username),
    password_hash: String(row.password_hash),
    is_active: toBoolean(row.is_active),
  }))
}

async function getDirectPermissions(conn, userId) {
  const rows = await conn.query(
    `SELECT permission_key
     FROM user_permissions
     WHERE user_id = ?`,
    [userId]
  )

  return new Set(rows.map(row => String(row.permission_key)))
}

async function getEffectivePermissions(conn, userId) {
  const permissions = await getDirectPermissions(conn, userId)

  const roleRows = await conn.query(
    `SELECT ur.role_id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?
       AND r.is_active = 1`,
    [userId]
  )

  const roleIds = roleRows
    .map(row => Number(row.role_id))
    .filter(id => Number.isFinite(id))

  if (roleIds.length) {
    const permRows = await conn.query(
      `SELECT permission_key
       FROM role_permissions
       WHERE role_id IN (${roleIds.map(() => '?').join(',')})`,
      roleIds
    )
    for (const row of permRows) permissions.add(String(row.permission_key))
  }

  if (permissions.has(CASH_REGISTER_MANAGE)) permissions.add(CASH_REGISTER_USE)
  return permissions
}

async function findAccountingUserById(conn, userId) {
  const rows = await conn.query(
    `SELECT id, username, password_hash, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  )

  if (!rows[0]) return null

  return {
    id: Number(rows[0].id),
    username: String(rows[0].username),
    password_hash: String(rows[0].password_hash),
    is_active: toBoolean(rows[0].is_active),
  }
}

async function createAccountingUser(conn, localUser, username) {
  const result = await conn.query(
    `INSERT INTO users (username, password_hash, is_active)
     VALUES (?, ?, ?)`,
    [username, localUser.password_hash, localUser.is_active ? 1 : 0]
  )

  return Number(result.insertId)
}

async function ensurePermissions(conn, userId, level) {
  const permissions = desiredPermissionsForLevel(level)
  for (const permission of permissions) {
    await conn.query(
      `INSERT IGNORE INTO user_permissions (user_id, permission_key)
       VALUES (?, ?)`,
      [userId, permission]
    )
  }
}

function printUser(prefix, user, level) {
  const active = user.is_active ? 'active' : 'inactive'
  console.log(`${prefix} #${user.id} ${user.username} (${active}, access: ${level})`)
}

async function chooseExistingAccountingUser(conn, allUsers, localUser) {
  const exactMatches = allUsers.filter(user => user.username === localUser.username)
  const similarMatches = allUsers.filter(user =>
    user.username !== localUser.username &&
    user.username.toLowerCase().includes(localUser.username.toLowerCase())
  )

  if (exactMatches.length) {
    console.log('Exact username matches:')
    for (const user of exactMatches) {
      const level = permissionLevelFromSet(await getEffectivePermissions(conn, user.id))
      printUser('  ', user, level)
    }
  }

  if (similarMatches.length) {
    console.log('Similar usernames:')
    for (const user of similarMatches.slice(0, 10)) {
      const level = permissionLevelFromSet(await getEffectivePermissions(conn, user.id))
      printUser('  ', user, level)
    }
  }

  while (true) {
    const raw = await ask('Enter existing accounting user id')
    const userId = Number(raw)
    if (!userId) {
      console.log('Please enter a numeric user id.')
      continue
    }

    const user = await findAccountingUserById(conn, userId)
    if (!user) {
      console.log(`No accounting user found for id ${userId}.`)
      continue
    }

    return user
  }
}

async function chooseNewAccountingUsername(conn, localUser) {
  while (true) {
    const username = await ask('Enter username for new accounting user', localUser.username)
    const rows = await conn.query(
      `SELECT id
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username]
    )

    if (rows.length) {
      console.log(`Username "${username}" already exists in accounting.`)
      continue
    }

    return username
  }
}

async function processLocalUser(localConn, accountingConn, localUser, allAccountingUsers) {
  const localPermissions = await getEffectivePermissions(localConn, localUser.id)
  const localLevel = permissionLevelFromSet(localPermissions)

  console.log('\n----------------------------------------')
  printUser('Local user', localUser, localLevel)

  const defaultAction = localLevel === 'none' ? 's' : 'm'
  const action = await askChoice(
    'Choose action: match existing user, create new user, skip, or quit',
    ['m', 'c', 's', 'q'],
    defaultAction
  )

  if (action === 'q') return { quit: true }
  if (action === 's') return { skipped: true }

  let accountingUser

  if (action === 'm') {
    accountingUser = await chooseExistingAccountingUser(accountingConn, allAccountingUsers, localUser)
  } else {
    const username = await chooseNewAccountingUsername(accountingConn, localUser)
    const confirmed = await confirm(`Create accounting user "${username}" using the local password hash`, true)
    if (!confirmed) return { skipped: true }

    const userId = await createAccountingUser(accountingConn, localUser, username)
    accountingUser = await findAccountingUserById(accountingConn, userId)
    allAccountingUsers.push(accountingUser)
    console.log(`Created accounting user #${accountingUser.id} ${accountingUser.username}`)
  }

  const existingAccountingPermissions = await getEffectivePermissions(accountingConn, accountingUser.id)
  const existingAccountingLevel = permissionLevelFromSet(existingAccountingPermissions)
  console.log(`Accounting user access before migration: ${existingAccountingLevel}`)

  const chosenLevel = await askChoice(
    'Grant cash register access level',
    ['manage', 'use', 'none'],
    localLevel
  )

  if (chosenLevel !== 'none') {
    await ensurePermissions(accountingConn, accountingUser.id, chosenLevel)
  }

  const finalPermissions = await getEffectivePermissions(accountingConn, accountingUser.id)
  const finalLevel = permissionLevelFromSet(finalPermissions)

  return {
    quit: false,
    skipped: false,
    localUserId: localUser.id,
    localUsername: localUser.username,
    accountingUserId: accountingUser.id,
    accountingUsername: accountingUser.username,
    finalLevel,
  }
}

async function main() {
  let localConn
  let accountingConn

  try {
    localConn = await localPool.getConnection()
    accountingConn = await accountingPool.getConnection()

    const localUsers = await fetchUsers(localConn)
    const accountingUsers = await fetchUsers(accountingConn)

    if (!localUsers.length) {
      console.log('migration: no local kassensystem users found')
      return
    }

    console.log(`Source database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT} as ${DB_USER}`)
    console.log(`Accounting database: ${ACCOUNTING_DB_NAME} @ ${ACCOUNTING_DB_HOST}:${ACCOUNTING_DB_PORT} as ${ACCOUNTING_DB_USER}`)
    console.log(`Found ${localUsers.length} local users and ${accountingUsers.length} accounting users.`)
    console.log('Existing accounting users keep their current roles. This script only adds direct cash register permissions when needed.')

    const proceed = await confirm('Start manual migration now', true)
    if (!proceed) return

    const results = []

    for (const localUser of localUsers) {
      const result = await processLocalUser(localConn, accountingConn, localUser, accountingUsers)
      if (result.quit) break
      if (!result.skipped) results.push(result)
    }

    console.log('\nMigration summary')
    if (!results.length) {
      console.log('No users were migrated.')
      return
    }

    for (const result of results) {
      console.log(
        `- local #${result.localUserId} ${result.localUsername} -> accounting #${result.accountingUserId} ${result.accountingUsername} (${result.finalLevel})`
      )
    }
  } finally {
    rl.close()
    if (localConn) localConn.release()
    if (accountingConn) accountingConn.release()
    await localPool.end()
    await accountingPool.end()
  }
}

main().catch((err) => {
  console.error('migration: failed', err)
  process.exit(1)
})
