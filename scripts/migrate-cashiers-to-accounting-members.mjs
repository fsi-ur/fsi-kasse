import * as mariadb from 'mariadb'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

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

async function ask(question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer || defaultValue
}

async function askChoice(question, choices, defaultValue) {
  const labels = choices.map(choice => choice === defaultValue ? `${choice}*` : choice).join('/')

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

async function ensureAccountingMemberIdColumn(conn) {
  const rows = await conn.query(`SHOW COLUMNS FROM cashiers LIKE 'accounting_member_id'`)
  if (rows.length) return

  await conn.query(`
    ALTER TABLE cashiers
      ADD COLUMN accounting_member_id BIGINT UNSIGNED NULL AFTER name,
      ADD UNIQUE KEY unique_accounting_member_id (accounting_member_id)
  `)

  console.log('migration: added cashiers.accounting_member_id mapping column')
}

async function fetchLocalCashiers(conn) {
  const rows = await conn.query(`
    SELECT
      c.id,
      c.name,
      c.accounting_member_id,
      c.is_active,
      COUNT(DISTINCT o.id) AS order_count,
      COUNT(DISTINCT fp_cashier.id) AS cashier_payment_count,
      COUNT(DISTINCT fp_member.id) AS member_payment_count
    FROM cashiers c
    LEFT JOIN orders o ON o.cashier_id = c.id
    LEFT JOIN fachschaft_payments fp_cashier ON fp_cashier.cashier_id = c.id
    LEFT JOIN fachschaft_payments fp_member ON fp_member.member_id = c.id
    GROUP BY c.id, c.name, c.accounting_member_id, c.is_active
    ORDER BY c.name ASC, c.id ASC
  `)

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    accounting_member_id: row.accounting_member_id == null ? null : Number(row.accounting_member_id),
    is_active: row.is_active === 1 || row.is_active === '1',
    order_count: Number(row.order_count ?? 0),
    cashier_payment_count: Number(row.cashier_payment_count ?? 0),
    member_payment_count: Number(row.member_payment_count ?? 0),
  }))
}

async function fetchAccountingMembers(conn) {
  const rows = await conn.query(`
    SELECT
      id,
      first_name,
      last_name,
      status,
      TRIM(CONCAT(first_name, ' ', last_name)) AS name,
      CASE
        WHEN status = 'left' THEN 0
        ELSE 1
      END AS is_active
    FROM members
    ORDER BY last_name ASC, first_name ASC, id ASC
  `)

  return rows.map(row => ({
    id: Number(row.id),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    status: String(row.status),
    name: String(row.name),
    is_active: row.is_active === 1 || row.is_active === '1',
  }))
}

function printAccountingMember(prefix, member) {
  const active = member.is_active ? 'active' : 'inactive'
  console.log(`${prefix}#${member.id} ${member.name} (status: ${member.status}, ${active})`)
}

function printSimilarMatches(localCashier, accountingMembers) {
  const exact = accountingMembers.filter(member => member.name === localCashier.name)
  const similar = accountingMembers.filter(member =>
    member.name !== localCashier.name &&
    member.name.toLowerCase().includes(localCashier.name.toLowerCase())
  )

  if (exact.length) {
    console.log('Exact name matches:')
    for (const member of exact.slice(0, 10)) printAccountingMember('  ', member)
  }

  if (similar.length) {
    console.log('Similar name matches:')
    for (const member of similar.slice(0, 10)) printAccountingMember('  ', member)
  }
}

async function chooseAccountingMember(localCashier, accountingMembers, reservedAccountingIds) {
  const defaultValue = localCashier.accounting_member_id ? String(localCashier.accounting_member_id) : 'skip'

  while (true) {
    printSimilarMatches(localCashier, accountingMembers)
    const answer = (await ask(
      `Map local cashier #${localCashier.id} "${localCashier.name}" to accounting member id, type "list", or "skip"`,
      defaultValue,
    )).trim().toLowerCase()

    if (answer === 'skip') return null

    if (answer === 'list') {
      for (const member of accountingMembers) printAccountingMember('  ', member)
      continue
    }

    const accountingMemberId = Number(answer)
    if (!accountingMemberId) {
      console.log('Please enter a numeric accounting member id, "list", or "skip".')
      continue
    }

    const accountingMember = accountingMembers.find(member => member.id === accountingMemberId)
    if (!accountingMember) {
      console.log(`No accounting member found for id ${accountingMemberId}.`)
      continue
    }

    const reservedBy = reservedAccountingIds.get(accountingMemberId)
    if (reservedBy && reservedBy !== localCashier.id) {
      console.log(`Accounting member #${accountingMemberId} is already reserved by local cashier #${reservedBy}.`)
      const merge = await confirm('Do you want to merge both local cashiers into the same accounting member?', true)
      if (!merge) continue
    }

    return accountingMemberId
  }
}

async function applyMappings(localConn, accountingMembers, mappingEntries) {
  if (!mappingEntries.length) {
    console.log('migration: no cashier mappings selected')
    return
  }

  const groups = new Map()
  for (const entry of mappingEntries) {
    if (!groups.has(entry.accountingMemberId)) groups.set(entry.accountingMemberId, [])
    groups.get(entry.accountingMemberId).push(entry.localCashierId)
  }

  await localConn.beginTransaction()

  try {
    await localConn.query(`
      UPDATE cashiers
      SET accounting_member_id = NULL
      WHERE accounting_member_id IS NOT NULL
    `)

    for (const [accountingMemberId, localCashierIds] of groups.entries()) {
      const accountingMember = accountingMembers.find(member => member.id === accountingMemberId)
      if (!accountingMember) {
        throw new Error(`ACCOUNTING_MEMBER_NOT_FOUND:${accountingMemberId}`)
      }

      const canonicalLocalCashierId = localCashierIds[0]
      const mergedLocalCashierIds = localCashierIds.slice(1)

      if (mergedLocalCashierIds.length) {
        const placeholders = mergedLocalCashierIds.map(() => '?').join(',')

        await localConn.query(
          `UPDATE orders
           SET cashier_id = ?
           WHERE cashier_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `UPDATE fachschaft_payments
           SET cashier_id = ?
           WHERE cashier_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `UPDATE fachschaft_payments
           SET member_id = ?
           WHERE member_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `DELETE FROM cashiers
           WHERE id IN (${placeholders})`,
          mergedLocalCashierIds,
        )
      }

      await localConn.query(
        `UPDATE cashiers
         SET accounting_member_id = ?, name = ?, image = NULL, is_active = ?
         WHERE id = ?`,
        [accountingMemberId, accountingMember.name, accountingMember.is_active ? 1 : 0, canonicalLocalCashierId],
      )
    }

    const localRows = await localConn.query(
      `SELECT accounting_member_id
       FROM cashiers
       WHERE accounting_member_id IS NOT NULL`
    )
    const existingAccountingIds = new Set(localRows.map(row => Number(row.accounting_member_id)))

    for (const accountingMember of accountingMembers) {
      if (existingAccountingIds.has(accountingMember.id)) continue

      await localConn.query(
        `INSERT INTO cashiers (name, accounting_member_id, image, is_active)
         VALUES (?, ?, NULL, ?)`,
        [accountingMember.name, accountingMember.id, accountingMember.is_active ? 1 : 0],
      )
    }

    await localConn.commit()
  } catch (err) {
    await localConn.rollback()
    throw err
  }
}

async function main() {
  let localConn
  let accountingConn

  try {
    localConn = await localPool.getConnection()
    accountingConn = await accountingPool.getConnection()

    await ensureAccountingMemberIdColumn(localConn)

    const localCashiers = await fetchLocalCashiers(localConn)
    const accountingMembers = await fetchAccountingMembers(accountingConn)

    if (!localCashiers.length) {
      console.log('migration: no local kassensystem cashiers found')
      return
    }

    if (!accountingMembers.length) {
      console.log('migration: no accounting members found in buchhaltung')
      return
    }

    console.log(`migration: found ${localCashiers.length} local cashiers and ${accountingMembers.length} accounting members`)
    console.log('Referenced local cashiers should be mapped so orders and payments stay reachable in connected mode.')

    const reservedAccountingIds = new Map()
    const mappingEntries = []

    for (const localCashier of localCashiers) {
      if (localCashier.accounting_member_id) {
        reservedAccountingIds.set(localCashier.accounting_member_id, localCashier.id)
      }
    }

    for (const localCashier of localCashiers) {
      const usage = `${localCashier.order_count} orders, ${localCashier.cashier_payment_count} cashier-payments, ${localCashier.member_payment_count} member-payments`
      const currentMapping = localCashier.accounting_member_id ? `, mapped to accounting member #${localCashier.accounting_member_id}` : ''
      console.log(`\nLocal cashier #${localCashier.id} ${localCashier.name} (${usage}${currentMapping})`)

      const accountingMemberId = await chooseAccountingMember(localCashier, accountingMembers, reservedAccountingIds)
      if (!accountingMemberId) {
        if (localCashier.order_count > 0 || localCashier.cashier_payment_count > 0 || localCashier.member_payment_count > 0) {
          console.log('Warning: this referenced cashier stays unavailable in connected mode until it is mapped.')
        }
        continue
      }

      reservedAccountingIds.set(accountingMemberId, localCashier.id)
      mappingEntries.push({
        localCashierId: localCashier.id,
        accountingMemberId,
      })
    }

    if (!mappingEntries.length) {
      console.log('migration: nothing selected, no changes made')
      return
    }

    console.log('\nSelected mappings:')
    for (const entry of mappingEntries) {
      const localCashier = localCashiers.find(cashier => cashier.id === entry.localCashierId)
      const accountingMember = accountingMembers.find(member => member.id === entry.accountingMemberId)
      console.log(`  local #${entry.localCashierId} ${localCashier?.name ?? ''} -> accounting #${entry.accountingMemberId} ${accountingMember?.name ?? ''}`)
    }

    const shouldApply = await confirm('Apply these mappings and create proxy rows for the remaining accounting members?', true)
    if (!shouldApply) {
      console.log('migration: aborted by user')
      return
    }

    await applyMappings(localConn, accountingMembers, mappingEntries)
    console.log('migration: completed successfully')
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
