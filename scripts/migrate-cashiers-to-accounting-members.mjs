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

async function chooseAccountingMember(localCashier, accountingMembers, reservedAccountingIds, currentMappedId) {
  const defaultValue = currentMappedId ? String(currentMappedId) : 'skip'

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

function printOverview(localCashiers, accountingMembers, pendingMappings) {
  const mappedAccountingIds = new Set(pendingMappings.values())
  const unmappedAccountingCount = accountingMembers.filter(m => !mappedAccountingIds.has(m.id)).length

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`Local cashiers: ${localCashiers.length}  |  Accounting members: ${accountingMembers.length}`)
  console.log(`Mapped: ${pendingMappings.size}  |  Local unmapped: ${localCashiers.length - pendingMappings.size}  |  Accounting without local: ${unmappedAccountingCount}`)

  if (pendingMappings.size > 0) {
    console.log('\nMapped:')
    for (const cashier of localCashiers) {
      const accId = pendingMappings.get(cashier.id)
      if (accId == null) continue
      const accMember = accountingMembers.find(m => m.id === accId)
      const usage = `${cashier.order_count} orders, ${cashier.cashier_payment_count} cashier-pmts, ${cashier.member_payment_count} member-pmts`
      console.log(`  #${cashier.id} "${cashier.name}" (${usage}) -> accounting #${accId} "${accMember?.name ?? '?'}"`)
    }
  }

  const unmappedLocal = localCashiers.filter(c => !pendingMappings.has(c.id))
  if (unmappedLocal.length > 0) {
    console.log('\nNot yet mapped:')
    for (const cashier of unmappedLocal) {
      const usage = `${cashier.order_count} orders, ${cashier.cashier_payment_count} cashier-pmts, ${cashier.member_payment_count} member-pmts`
      const hasData = cashier.order_count > 0 || cashier.cashier_payment_count > 0 || cashier.member_payment_count > 0
      const warn = hasData ? ' [!]' : ''
      console.log(`  #${cashier.id} "${cashier.name}" (${usage})${warn}`)
    }
  }

  console.log(`${'─'.repeat(64)}`)
}

async function applyMappings(localConn, accountingMembers, pendingMappings, addProxyRows) {
  const mappingEntries = [...pendingMappings.entries()].map(([localCashierId, accountingMemberId]) => ({ localCashierId, accountingMemberId }))

  const groups = new Map()
  for (const entry of mappingEntries) {
    if (!groups.has(entry.accountingMemberId)) groups.set(entry.accountingMemberId, [])
    groups.get(entry.accountingMemberId).push(entry.localCashierId)
  }

  await localConn.beginTransaction()

  try {
    await localConn.query(`UPDATE cashiers SET accounting_member_id = NULL WHERE accounting_member_id IS NOT NULL`)

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
          `UPDATE orders SET cashier_id = ? WHERE cashier_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `UPDATE fachschaft_payments SET cashier_id = ? WHERE cashier_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `UPDATE fachschaft_payments SET member_id = ? WHERE member_id IN (${placeholders})`,
          [canonicalLocalCashierId, ...mergedLocalCashierIds],
        )

        await localConn.query(
          `DELETE FROM cashiers WHERE id IN (${placeholders})`,
          mergedLocalCashierIds,
        )
      }

      await localConn.query(
        `UPDATE cashiers SET accounting_member_id = ?, name = ?, image = NULL, is_active = ? WHERE id = ?`,
        [accountingMemberId, accountingMember.name, accountingMember.is_active ? 1 : 0, canonicalLocalCashierId],
      )
    }

    if (addProxyRows) {
      const localRows = await localConn.query(`SELECT accounting_member_id FROM cashiers WHERE accounting_member_id IS NOT NULL`)
      const existingAccountingIds = new Set(localRows.map(row => Number(row.accounting_member_id)))

      let proxyCount = 0
      for (const accountingMember of accountingMembers) {
        if (existingAccountingIds.has(accountingMember.id)) continue

        await localConn.query(
          `INSERT INTO cashiers (name, accounting_member_id, image, is_active) VALUES (?, ?, NULL, ?)`,
          [accountingMember.name, accountingMember.id, accountingMember.is_active ? 1 : 0],
        )
        proxyCount++
      }

      if (proxyCount) console.log(`migration: inserted ${proxyCount} proxy rows for unmapped accounting members`)
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
    console.log('Map local cashiers to their accounting member counterparts so orders and payments stay reachable in connected mode.')

    // Pre-populate from existing DB mappings
    const pendingMappings = new Map() // localCashierId -> accountingMemberId
    const reservedAccountingIds = new Map() // accountingMemberId -> localCashierId

    for (const cashier of localCashiers) {
      if (cashier.accounting_member_id != null) {
        pendingMappings.set(cashier.id, cashier.accounting_member_id)
        reservedAccountingIds.set(cashier.accounting_member_id, cashier.id)
      }
    }

    // Interactive mapping loop
    while (true) {
      printOverview(localCashiers, accountingMembers, pendingMappings)
      console.log('Commands: local cashier id to edit  |  "all"  |  "unmapped"  |  "cleanup"  |  "apply"  |  "quit"')
      const answer = (await rl.question('> ')).trim().toLowerCase()

      if (answer === 'quit') {
        console.log('migration: aborted by user')
        return
      }

      if (answer === 'apply') break

      if (answer === 'cleanup') {
        const orphans = localCashiers.filter(c =>
          c.order_count === 0 && c.cashier_payment_count === 0 && c.member_payment_count === 0
        )
        if (!orphans.length) {
          console.log('No unreferenced cashiers found.')
          continue
        }

        console.log(`\n${orphans.length} cashiers with no orders or payments:`)
        for (const c of orphans) {
          const proxyNote = c.accounting_member_id != null ? ` (proxy for accounting member #${c.accounting_member_id})` : ''
          console.log(`  #${c.id} "${c.name}"${proxyNote}`)
        }

        const shouldDelete = await confirm(`Delete these ${orphans.length} cashiers?`, false)
        if (!shouldDelete) continue

        const ids = orphans.map(c => c.id)
        await localConn.query(
          `DELETE FROM cashiers WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids,
        )

        for (const c of orphans) {
          localCashiers.splice(localCashiers.indexOf(c), 1)
          const accId = pendingMappings.get(c.id)
          if (accId != null && reservedAccountingIds.get(accId) === c.id) reservedAccountingIds.delete(accId)
          pendingMappings.delete(c.id)
        }

        console.log(`Deleted ${orphans.length} unreferenced cashiers.`)
        continue
      }

      let toProcess
      if (answer === 'all') {
        toProcess = localCashiers
      } else if (answer === 'unmapped') {
        toProcess = localCashiers.filter(c => !pendingMappings.has(c.id))
        if (!toProcess.length) {
          console.log('All local cashiers are already mapped.')
          continue
        }
      } else {
        const id = Number(answer)
        if (!id) {
          console.log('Please enter a valid command or a numeric local cashier id.')
          continue
        }
        const cashier = localCashiers.find(c => c.id === id)
        if (!cashier) {
          console.log(`No local cashier found with id ${id}.`)
          continue
        }
        toProcess = [cashier]
      }

      for (const localCashier of toProcess) {
        const currentMappedId = pendingMappings.get(localCashier.id) ?? null
        const usage = `${localCashier.order_count} orders, ${localCashier.cashier_payment_count} cashier-pmts, ${localCashier.member_payment_count} member-pmts`
        const currentMapping = currentMappedId != null ? `, currently -> accounting #${currentMappedId}` : ''
        console.log(`\nLocal cashier #${localCashier.id} "${localCashier.name}" (${usage}${currentMapping})`)

        const accountingMemberId = await chooseAccountingMember(localCashier, accountingMembers, reservedAccountingIds, currentMappedId)

        // Release old reservation before applying the new choice
        if (currentMappedId != null && reservedAccountingIds.get(currentMappedId) === localCashier.id) {
          reservedAccountingIds.delete(currentMappedId)
        }

        if (accountingMemberId != null) {
          pendingMappings.set(localCashier.id, accountingMemberId)
          reservedAccountingIds.set(accountingMemberId, localCashier.id)
        } else {
          pendingMappings.delete(localCashier.id)
          const hasData = localCashier.order_count > 0 || localCashier.cashier_payment_count > 0 || localCashier.member_payment_count > 0
          if (hasData) {
            console.log('Warning: this referenced cashier stays unavailable in connected mode until it is mapped.')
          }
        }
      }
    }

    if (!pendingMappings.size) {
      console.log('migration: no mappings selected, no changes made')
      return
    }

    console.log('\nFinal mappings to apply:')
    for (const [localCashierId, accMemberId] of pendingMappings.entries()) {
      const cashier = localCashiers.find(c => c.id === localCashierId)
      const member = accountingMembers.find(m => m.id === accMemberId)
      console.log(`  local #${localCashierId} "${cashier?.name}" -> accounting #${accMemberId} "${member?.name}"`)
    }

    const mappedAccountingIds = new Set(pendingMappings.values())
    const unmappedAccountingMembers = accountingMembers.filter(m => !mappedAccountingIds.has(m.id))

    let addProxyRows = false
    if (unmappedAccountingMembers.length) {
      console.log(`\n${unmappedAccountingMembers.length} accounting members have no local counterpart.`)
      console.log('Proxy rows let kassensystem show and select these members as cashiers without querying accounting at runtime.')
      addProxyRows = await confirm('Insert proxy rows for unmapped accounting members?', true)
    }

    const shouldApply = await confirm('\nApply all changes now?', true)
    if (!shouldApply) {
      console.log('migration: aborted by user')
      return
    }

    await applyMappings(localConn, accountingMembers, pendingMappings, addProxyRows)
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
