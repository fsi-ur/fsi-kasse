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

async function ensureAccountingEventIdColumn(conn) {
  const rows = await conn.query(`SHOW COLUMNS FROM events LIKE 'accounting_event_id'`)
  if (rows.length) return

  await conn.query(`
    ALTER TABLE events
      ADD COLUMN accounting_event_id BIGINT UNSIGNED NULL AFTER name,
      ADD UNIQUE KEY unique_accounting_event_id (accounting_event_id)
  `)

  console.log('migration: added events.accounting_event_id mapping column')
}

async function fetchLocalEvents(conn) {
  const rows = await conn.query(`
    SELECT
      e.id,
      e.name,
      e.accounting_event_id,
      e.is_active,
      COUNT(DISTINCT o.id) AS order_count,
      COUNT(DISTINCT p.id) AS payment_count
    FROM events e
    LEFT JOIN orders o ON o.event_id = e.id
    LEFT JOIN fachschaft_payments p ON p.event_id = e.id
    GROUP BY e.id, e.name, e.accounting_event_id, e.is_active
    ORDER BY e.name ASC, e.id ASC
  `)

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    accounting_event_id: row.accounting_event_id == null ? null : Number(row.accounting_event_id),
    is_active: row.is_active === 1 || row.is_active === '1',
    order_count: Number(row.order_count ?? 0),
    payment_count: Number(row.payment_count ?? 0),
  }))
}

async function fetchAccountingEvents(conn) {
  const rows = await conn.query(`
    SELECT
      id,
      name,
      starts_at,
      ends_at,
      location,
      1 AS is_active
    FROM events
    ORDER BY starts_at DESC, ends_at DESC, name ASC, id ASC
  `)

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    location: String(row.location),
    is_active: row.is_active === 1 || row.is_active === '1',
  }))
}

function printAccountingEvent(prefix, event) {
  const active = event.is_active ? 'active' : 'inactive'
  console.log(`${prefix}#${event.id} ${event.name} (${event.starts_at} -> ${event.ends_at}, ${event.location}, ${active})`)
}

function printSimilarMatches(localEvent, accountingEvents) {
  const exact = accountingEvents.filter(event => event.name === localEvent.name)
  const similar = accountingEvents.filter(event =>
    event.name !== localEvent.name &&
    event.name.toLowerCase().includes(localEvent.name.toLowerCase())
  )

  if (exact.length) {
    console.log('Exact name matches:')
    for (const event of exact.slice(0, 10)) printAccountingEvent('  ', event)
  }

  if (similar.length) {
    console.log('Similar name matches:')
    for (const event of similar.slice(0, 10)) printAccountingEvent('  ', event)
  }
}

async function chooseAccountingEvent(localEvent, accountingEvents, reservedAccountingIds, currentMappedId) {
  const defaultValue = currentMappedId ? String(currentMappedId) : 'skip'

  while (true) {
    printSimilarMatches(localEvent, accountingEvents)
    const answer = (await ask(
      `Map local event #${localEvent.id} "${localEvent.name}" to accounting event id, type "list", or "skip"`,
      defaultValue,
    )).trim().toLowerCase()

    if (answer === 'skip') return null

    if (answer === 'list') {
      for (const event of accountingEvents) printAccountingEvent('  ', event)
      continue
    }

    const accountingEventId = Number(answer)
    if (!accountingEventId) {
      console.log('Please enter a numeric accounting event id, "list", or "skip".')
      continue
    }

    const accountingEvent = accountingEvents.find(event => event.id === accountingEventId)
    if (!accountingEvent) {
      console.log(`No accounting event found for id ${accountingEventId}.`)
      continue
    }

    const reservedBy = reservedAccountingIds.get(accountingEventId)
    if (reservedBy && reservedBy !== localEvent.id) {
      console.log(`Accounting event #${accountingEventId} is already reserved by local event #${reservedBy}.`)
      const merge = await confirm('Do you want to merge both local events into the same accounting event?', true)
      if (!merge) continue
    }

    return accountingEventId
  }
}

function printOverview(localEvents, accountingEvents, pendingMappings) {
  const mappedAccountingIds = new Set(pendingMappings.values())
  const unmappedAccountingCount = accountingEvents.filter(e => !mappedAccountingIds.has(e.id)).length

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`Local events: ${localEvents.length}  |  Accounting events: ${accountingEvents.length}`)
  console.log(`Mapped: ${pendingMappings.size}  |  Local unmapped: ${localEvents.length - pendingMappings.size}  |  Accounting without local: ${unmappedAccountingCount}`)

  if (pendingMappings.size > 0) {
    console.log('\nMapped:')
    for (const localEvent of localEvents) {
      const accId = pendingMappings.get(localEvent.id)
      if (accId == null) continue
      const accEvent = accountingEvents.find(e => e.id === accId)
      const usage = `${localEvent.order_count} orders, ${localEvent.payment_count} payments`
      console.log(`  #${localEvent.id} "${localEvent.name}" (${usage}) -> accounting #${accId} "${accEvent?.name ?? '?'}"`)
    }
  }

  const unmappedLocal = localEvents.filter(e => !pendingMappings.has(e.id))
  if (unmappedLocal.length > 0) {
    console.log('\nNot yet mapped:')
    for (const localEvent of unmappedLocal) {
      const usage = `${localEvent.order_count} orders, ${localEvent.payment_count} payments`
      const warn = (localEvent.order_count > 0 || localEvent.payment_count > 0) ? ' [!]' : ''
      console.log(`  #${localEvent.id} "${localEvent.name}" (${usage})${warn}`)
    }
  }

  console.log(`${'─'.repeat(64)}`)
}

async function applyMappings(localConn, accountingEvents, pendingMappings, addProxyRows) {
  const mappingEntries = [...pendingMappings.entries()].map(([localEventId, accountingEventId]) => ({ localEventId, accountingEventId }))

  const groups = new Map()
  for (const entry of mappingEntries) {
    if (!groups.has(entry.accountingEventId)) groups.set(entry.accountingEventId, [])
    groups.get(entry.accountingEventId).push(entry.localEventId)
  }

  await localConn.beginTransaction()

  try {
    await localConn.query(`UPDATE events SET accounting_event_id = NULL WHERE accounting_event_id IS NOT NULL`)

    for (const [accountingEventId, localEventIds] of groups.entries()) {
      const accountingEvent = accountingEvents.find(event => event.id === accountingEventId)
      if (!accountingEvent) {
        throw new Error(`ACCOUNTING_EVENT_NOT_FOUND:${accountingEventId}`)
      }

      const canonicalLocalEventId = localEventIds[0]
      const mergedLocalEventIds = localEventIds.slice(1)

      if (mergedLocalEventIds.length) {
        const placeholders = mergedLocalEventIds.map(() => '?').join(',')

        await localConn.query(
          `UPDATE orders SET event_id = ? WHERE event_id IN (${placeholders})`,
          [canonicalLocalEventId, ...mergedLocalEventIds],
        )

        await localConn.query(
          `UPDATE fachschaft_payments SET event_id = ? WHERE event_id IN (${placeholders})`,
          [canonicalLocalEventId, ...mergedLocalEventIds],
        )

        await localConn.query(
          `DELETE FROM events WHERE id IN (${placeholders})`,
          mergedLocalEventIds,
        )
      }

      await localConn.query(
        `UPDATE events SET accounting_event_id = ?, name = ?, is_active = ? WHERE id = ?`,
        [accountingEventId, accountingEvent.name, accountingEvent.is_active ? 1 : 0, canonicalLocalEventId],
      )
    }

    if (addProxyRows) {
      const localRows = await localConn.query(`SELECT accounting_event_id FROM events WHERE accounting_event_id IS NOT NULL`)
      const existingAccountingIds = new Set(localRows.map(row => Number(row.accounting_event_id)))

      let proxyCount = 0
      for (const accountingEvent of accountingEvents) {
        if (existingAccountingIds.has(accountingEvent.id)) continue

        await localConn.query(
          `INSERT INTO events (name, accounting_event_id, is_active) VALUES (?, ?, ?)`,
          [accountingEvent.name, accountingEvent.id, accountingEvent.is_active ? 1 : 0],
        )
        proxyCount++
      }

      if (proxyCount) console.log(`migration: inserted ${proxyCount} proxy rows for unmapped accounting events`)
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

    await ensureAccountingEventIdColumn(localConn)

    const localEvents = await fetchLocalEvents(localConn)
    const accountingEvents = await fetchAccountingEvents(accountingConn)

    if (!localEvents.length) {
      console.log('migration: no local kassensystem events found')
      return
    }

    if (!accountingEvents.length) {
      console.log('migration: no accounting events found in buchhaltung')
      return
    }

    console.log(`migration: found ${localEvents.length} local events and ${accountingEvents.length} accounting events`)
    console.log('Map local events to their accounting counterparts so historical orders stay reachable in connected mode.')

    // Pre-populate from existing DB mappings
    const pendingMappings = new Map() // localEventId -> accountingEventId
    const reservedAccountingIds = new Map() // accountingEventId -> localEventId

    for (const localEvent of localEvents) {
      if (localEvent.accounting_event_id != null) {
        pendingMappings.set(localEvent.id, localEvent.accounting_event_id)
        reservedAccountingIds.set(localEvent.accounting_event_id, localEvent.id)
      }
    }

    // Interactive mapping loop
    while (true) {
      printOverview(localEvents, accountingEvents, pendingMappings)
      console.log('Commands: local event id to edit  |  "all"  |  "unmapped"  |  "cleanup"  |  "apply"  |  "quit"')
      const answer = (await rl.question('> ')).trim().toLowerCase()

      if (answer === 'quit') {
        console.log('migration: aborted by user')
        return
      }

      if (answer === 'apply') break

      if (answer === 'cleanup') {
        const orphans = localEvents.filter(e => e.order_count === 0 && e.payment_count === 0)
        if (!orphans.length) {
          console.log('No unreferenced events found.')
          continue
        }

        console.log(`\n${orphans.length} events with no orders or payments:`)
        for (const e of orphans) {
          const proxyNote = e.accounting_event_id != null ? ` (proxy for accounting #${e.accounting_event_id})` : ''
          console.log(`  #${e.id} "${e.name}"${proxyNote}`)
        }

        const shouldDelete = await confirm(`Delete these ${orphans.length} events?`, false)
        if (!shouldDelete) continue

        const ids = orphans.map(e => e.id)
        await localConn.query(
          `DELETE FROM events WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids,
        )

        for (const e of orphans) {
          localEvents.splice(localEvents.indexOf(e), 1)
          const accId = pendingMappings.get(e.id)
          if (accId != null && reservedAccountingIds.get(accId) === e.id) reservedAccountingIds.delete(accId)
          pendingMappings.delete(e.id)
        }

        console.log(`Deleted ${orphans.length} unreferenced events.`)
        continue
      }

      let toProcess
      if (answer === 'all') {
        toProcess = localEvents
      } else if (answer === 'unmapped') {
        toProcess = localEvents.filter(e => !pendingMappings.has(e.id))
        if (!toProcess.length) {
          console.log('All local events are already mapped.')
          continue
        }
      } else {
        const id = Number(answer)
        if (!id) {
          console.log('Please enter a valid command or a numeric local event id.')
          continue
        }
        const event = localEvents.find(e => e.id === id)
        if (!event) {
          console.log(`No local event found with id ${id}.`)
          continue
        }
        toProcess = [event]
      }

      for (const localEvent of toProcess) {
        const currentMappedId = pendingMappings.get(localEvent.id) ?? null
        const usage = `${localEvent.order_count} orders, ${localEvent.payment_count} payments`
        const currentMapping = currentMappedId != null ? `, currently -> accounting #${currentMappedId}` : ''
        console.log(`\nLocal event #${localEvent.id} "${localEvent.name}" (${usage}${currentMapping})`)

        const accountingEventId = await chooseAccountingEvent(localEvent, accountingEvents, reservedAccountingIds, currentMappedId)

        // Release old reservation before applying the new choice
        if (currentMappedId != null && reservedAccountingIds.get(currentMappedId) === localEvent.id) {
          reservedAccountingIds.delete(currentMappedId)
        }

        if (accountingEventId != null) {
          pendingMappings.set(localEvent.id, accountingEventId)
          reservedAccountingIds.set(accountingEventId, localEvent.id)
        } else {
          pendingMappings.delete(localEvent.id)
          if (localEvent.order_count > 0 || localEvent.payment_count > 0) {
            console.log('Warning: this referenced event stays unavailable in connected mode until it is mapped.')
          }
        }
      }
    }

    if (!pendingMappings.size) {
      console.log('migration: no mappings selected, no changes made')
      return
    }

    console.log('\nFinal mappings to apply:')
    for (const [localEventId, accEventId] of pendingMappings.entries()) {
      const localEvent = localEvents.find(e => e.id === localEventId)
      const accEvent = accountingEvents.find(e => e.id === accEventId)
      console.log(`  local #${localEventId} "${localEvent?.name}" -> accounting #${accEventId} "${accEvent?.name}"`)
    }

    const mappedAccountingIds = new Set(pendingMappings.values())
    const unmappedAccountingEvents = accountingEvents.filter(e => !mappedAccountingIds.has(e.id))

    let addProxyRows = false
    if (unmappedAccountingEvents.length) {
      console.log(`\n${unmappedAccountingEvents.length} accounting events have no local counterpart.`)
      console.log('Proxy rows let kassensystem show and select these events without querying accounting at runtime.')
      addProxyRows = await confirm('Insert proxy rows for unmapped accounting events?', true)
    }

    const shouldApply = await confirm('\nApply all changes now?', true)
    if (!shouldApply) {
      console.log('migration: aborted by user')
      return
    }

    await applyMappings(localConn, accountingEvents, pendingMappings, addProxyRows)
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
