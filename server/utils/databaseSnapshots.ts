import type * as mariadb from 'mariadb'
import crypto from 'crypto'
import { Readable } from 'stream'
import { getDbConnection, isConnectedAccountingMode, query, withTransaction } from '~/server/utils/db'
import { normalizeBigInt } from '~/server/utils/normalize'

const SNAPSHOT_FORMAT = 'fsi-kassensystem.database-snapshot'
const ENCRYPTED_SNAPSHOT_FORMAT = 'fsi-kassensystem.encrypted-database-snapshot'
const SNAPSHOT_VERSION = 1
const SUPPORTED_SNAPSHOT_VERSIONS = new Set([1])
const CONTENT_EXCLUDED_TABLES = new Set(['sessions'])
const ENCRYPTED_SNAPSHOT_MAGIC = Buffer.from('FSI-KASSE-SNAPSHOT-ENC\0', 'utf8')
const ENCRYPTED_SNAPSHOT_TAG_LENGTH = 16
const ENCRYPTED_SNAPSHOT_SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export type SnapshotErrorCode =
  | 'invalidPassword'
  | 'wrongPassword'
  | 'notEncrypted'
  | 'corruptedFile'
  | 'unsupportedFormat'
  | 'schemaMismatch'
  | 'integrityFailed'
  | 'previewExpired'
  | 'restoreInProgress'
  | 'databaseDenied'
  | 'databaseBusy'
  | 'databaseUnavailable'
  | 'databaseFull'
  | 'restoreConstraintFailed'
  | 'restoreDataRejected'
  | 'emptySnapshot'

export class SnapshotError extends Error {
  constructor(
    public readonly code: SnapshotErrorCode,
    message: string,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(message)
    this.name = 'SnapshotError'
  }
}

type AccountingModeLabel = 'standalone' | 'connected'

interface TableColumn {
  table_name: string
  column_name: string
  ordinal_position: number
}

interface SnapshotTable {
  name: string
  columns: string[]
  rows: Record<string, unknown>[]
  checksum?: string
}

export interface DatabaseSnapshot {
  format: typeof SNAPSHOT_FORMAT
  version: number
  createdAt: string
  database: string | null
  app?: {
    name: string
    version: string | null
  }
  schema?: {
    version: string
    checksum?: string
  }
  integrity?: {
    algorithm: 'sha256'
    checksum: string
  }
  excludedContent?: string[]
  accountingMode?: AccountingModeLabel
  tables: SnapshotTable[]
}

interface EncryptedSnapshotHeader {
  format: typeof ENCRYPTED_SNAPSHOT_FORMAT
  version: 1
  cipher: 'aes-256-gcm'
  kdf: 'scrypt'
  kdfOptions: typeof ENCRYPTED_SNAPSHOT_SCRYPT_OPTIONS
  salt: string
  iv: string
  tagLength: number
}

export interface SnapshotPreview {
  ok: true
  format: string
  version: number
  createdAt: string | null
  database: string | null
  appName: string | null
  appVersion: string | null
  schemaVersion: string | null
  schemaChecksum: string | null
  tables: number
  rows: number
  excludedContent: string[]
  accountingMode: AccountingModeLabel | null
  currentAccountingMode: AccountingModeLabel
  integrity: {
    present: boolean
    valid: boolean
    algorithm: string | null
    checksum: string | null
  }
}

function currentAccountingModeLabel(): AccountingModeLabel {
  return isConnectedAccountingMode() ? 'connected' : 'standalone'
}

/**
 * Maps low-level mariadb driver errors to a SnapshotError the user can act on,
 * so a broken connection or a missing DB grant never surfaces as a raw SQL error.
 */
function translateDatabaseError(err: unknown, table?: string): never {
  if (err instanceof SnapshotError) throw err

  const driverErr = err as { errno?: number, code?: string, message?: string } | null
  const errno = driverErr?.errno
  const code = driverErr?.code
  const message = String(driverErr?.message || err)

  const deniedErrnos = new Set([1142, 1044, 1227])
  const busyErrnos = new Set([1205, 1213])
  const constraintErrnos = new Set([1451, 1452])
  const rejectedErrnos = new Set([1062, 1406, 1292, 1264])
  const fullErrnos = new Set([1021])
  const unavailableCodes = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_GET_CONNECTION_TIMEOUT'])

  if (typeof errno === 'number' && deniedErrnos.has(errno)) throw new SnapshotError('databaseDenied', message)
  if (typeof errno === 'number' && busyErrnos.has(errno)) throw new SnapshotError('databaseBusy', message)
  if (typeof errno === 'number' && constraintErrnos.has(errno)) throw new SnapshotError('restoreConstraintFailed', message)
  if (typeof errno === 'number' && rejectedErrnos.has(errno)) {
    throw new SnapshotError('restoreDataRejected', message, table ? { table } : {})
  }
  if ((typeof errno === 'number' && fullErrnos.has(errno)) || code === 'ENOSPC') throw new SnapshotError('databaseFull', message)
  if ((code && unavailableCodes.has(code)) || /pool timeout/i.test(message)) throw new SnapshotError('databaseUnavailable', message)

  throw err
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error(`Invalid database identifier: ${identifier}`)
  return `\`${identifier}\``
}

function stableStringify(value: unknown): string {
  if (typeof value === 'undefined') return 'null'
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`
}

function sha256(value: unknown) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function normalizeSnapshotPassword(password: unknown) {
  const value = String(password || '')
  if (value.length < 12) throw new SnapshotError('invalidPassword', 'Snapshot password must contain at least 12 characters')
  return value
}

function deriveSnapshotEncryptionKey(password: string, salt: Buffer) {
  return crypto.scryptSync(password, salt, 32, ENCRYPTED_SNAPSHOT_SCRYPT_OPTIONS)
}

export function isEncryptedSnapshotBuffer(value: Buffer) {
  return value.subarray(0, ENCRYPTED_SNAPSHOT_MAGIC.length).equals(ENCRYPTED_SNAPSHOT_MAGIC)
}

function buildEncryptedSnapshotHeader(password: string) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveSnapshotEncryptionKey(password, salt)
  const header: EncryptedSnapshotHeader = {
    format: ENCRYPTED_SNAPSHOT_FORMAT,
    version: 1,
    cipher: 'aes-256-gcm',
    kdf: 'scrypt',
    kdfOptions: ENCRYPTED_SNAPSHOT_SCRYPT_OPTIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tagLength: ENCRYPTED_SNAPSHOT_TAG_LENGTH,
  }

  return { header, key, iv }
}

export function createEncryptedDatabaseSnapshotStream(passwordValue: unknown) {
  const password = normalizeSnapshotPassword(passwordValue)
  const { header, key, iv } = buildEncryptedSnapshotHeader(password)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: ENCRYPTED_SNAPSHOT_TAG_LENGTH })
  const headerBuffer = Buffer.from(JSON.stringify(header), 'utf8')
  const headerLength = Buffer.alloc(4)
  headerLength.writeUInt32BE(headerBuffer.length, 0)

  return Readable.from((async function* () {
    yield ENCRYPTED_SNAPSHOT_MAGIC
    yield headerLength
    yield headerBuffer

    for await (const chunk of createDatabaseSnapshotStream()) {
      const encrypted = cipher.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'))
      if (encrypted.length) yield encrypted
    }

    const final = cipher.final()
    if (final.length) yield final
    yield cipher.getAuthTag()
  })())
}

export function decryptDatabaseSnapshotBuffer(encryptedSnapshot: Buffer, passwordValue: unknown) {
  if (!isEncryptedSnapshotBuffer(encryptedSnapshot)) throw new SnapshotError('notEncrypted', 'Snapshot is not encrypted')
  const password = normalizeSnapshotPassword(passwordValue)

  if (encryptedSnapshot.length < ENCRYPTED_SNAPSHOT_MAGIC.length + 4 + ENCRYPTED_SNAPSHOT_TAG_LENGTH) {
    throw new SnapshotError('corruptedFile', 'Encrypted snapshot is incomplete')
  }

  const headerLengthOffset = ENCRYPTED_SNAPSHOT_MAGIC.length
  const headerLength = encryptedSnapshot.readUInt32BE(headerLengthOffset)
  const headerStart = headerLengthOffset + 4
  const headerEnd = headerStart + headerLength
  const tagStart = encryptedSnapshot.length - ENCRYPTED_SNAPSHOT_TAG_LENGTH

  if (headerLength <= 0 || headerEnd >= tagStart) throw new SnapshotError('corruptedFile', 'Encrypted snapshot header is invalid')

  let header: EncryptedSnapshotHeader
  try {
    header = JSON.parse(encryptedSnapshot.subarray(headerStart, headerEnd).toString('utf8')) as EncryptedSnapshotHeader
  } catch {
    throw new SnapshotError('corruptedFile', 'Encrypted snapshot header is invalid')
  }
  if (
    header.format !== ENCRYPTED_SNAPSHOT_FORMAT ||
    header.version !== 1 ||
    header.cipher !== 'aes-256-gcm' ||
    header.kdf !== 'scrypt' ||
    header.tagLength !== ENCRYPTED_SNAPSHOT_TAG_LENGTH
  ) {
    throw new SnapshotError('unsupportedFormat', 'Unsupported encrypted snapshot format')
  }

  const salt = Buffer.from(header.salt, 'base64')
  const iv = Buffer.from(header.iv, 'base64')
  const key = deriveSnapshotEncryptionKey(password, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: ENCRYPTED_SNAPSHOT_TAG_LENGTH })
  decipher.setAuthTag(encryptedSnapshot.subarray(tagStart))

  try {
    return Buffer.concat([
      decipher.update(encryptedSnapshot.subarray(headerEnd, tagStart)),
      decipher.final(),
    ])
  } catch {
    // AES-GCM authentication failure: wrong password or tampered ciphertext
    throw new SnapshotError('wrongPassword', 'Snapshot password is incorrect or the snapshot file is corrupted')
  }
}

export function parseEncryptedDatabaseSnapshot(encryptedSnapshot: Buffer, passwordValue: unknown) {
  const decrypted = decryptDatabaseSnapshotBuffer(encryptedSnapshot, passwordValue)
  try {
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    throw new SnapshotError('corruptedFile', 'Decrypted snapshot is not valid JSON')
  }
}

function checksumSnapshot(snapshot: DatabaseSnapshot) {
  const { integrity, ...snapshotWithoutIntegrity } = snapshot
  return sha256({
    ...snapshotWithoutIntegrity,
    tables: snapshot.tables.map(table => ({
      name: table.name,
      columns: table.columns,
      checksum: table.checksum || sha256(tablePayload(table)),
      rows: (table as SnapshotTable & { rowCount?: number }).rowCount ?? table.rows.length,
    })),
  })
}

function tablePayload(table: SnapshotTable) {
  return {
    name: table.name,
    columns: table.columns,
    rows: table.rows,
  }
}

function startTableChecksum(table: { name: string, columns: string[] }) {
  const hash = crypto.createHash('sha256')
  hash.update('{"columns":')
  hash.update(stableStringify(table.columns))
  hash.update(',"name":')
  hash.update(stableStringify(table.name))
  hash.update(',"rows":[')
  return hash
}

async function computeTableChecksum(table: { name: string, columns: string[] }) {
  if (CONTENT_EXCLUDED_TABLES.has(table.name)) {
    return {
      checksum: sha256(tablePayload({ name: table.name, columns: table.columns, rows: [] })),
      rows: 0,
    }
  }

  const hash = startTableChecksum(table)
  let count = 0
  let conn: mariadb.PoolConnection | undefined

  try {
    conn = await getDbConnection()
    const stream = conn.queryStream(`SELECT * FROM ${quoteIdentifier(table.name)}`)
    for await (const rawRow of stream) {
      if (count > 0) hash.update(',')
      hash.update(stableStringify(normalizeBigInt(rawRow)))
      count += 1
    }
  } catch (err) {
    translateDatabaseError(err)
  } finally {
    conn?.release()
  }

  hash.update(']}')
  return { checksum: hash.digest('hex'), rows: count }
}

async function* streamTableRows(table: { name: string }) {
  if (CONTENT_EXCLUDED_TABLES.has(table.name)) return

  let conn: mariadb.PoolConnection | undefined

  try {
    conn = await getDbConnection()
    const stream = conn.queryStream(`SELECT * FROM ${quoteIdentifier(table.name)}`)
    for await (const rawRow of stream) {
      yield normalizeBigInt(rawRow)
    }
  } catch (err) {
    translateDatabaseError(err)
  } finally {
    conn?.release()
  }
}

export function createDatabaseSnapshotStream() {
  return Readable.from((async function* () {
    const tableDefinitions = await getTableColumns()
    const tableStats = new Map<string, { checksum: string, rows: number }>()

    for (const table of tableDefinitions) {
      tableStats.set(table.name, await computeTableChecksum(table))
    }

    const snapshotMeta: Omit<DatabaseSnapshot, 'tables'> & { tables: [] } = {
      format: SNAPSHOT_FORMAT,
      version: SNAPSHOT_VERSION,
      createdAt: new Date().toISOString(),
      database: process.env.DB_NAME || null,
      app: {
        name: 'kassensystem',
        version: process.env.npm_package_version || null,
      },
      schema: {
        version: process.env.DB_SCHEMA_VERSION || 'init.sql',
        checksum: sha256(tableDefinitions),
      },
      excludedContent: [...CONTENT_EXCLUDED_TABLES],
      accountingMode: currentAccountingModeLabel(),
      tables: [],
    }
    const integrityTables = tableDefinitions.map(table => ({
      name: table.name,
      columns: table.columns,
      rows: [],
      rowCount: tableStats.get(table.name)?.rows || 0,
      checksum: tableStats.get(table.name)!.checksum,
    })) as Array<SnapshotTable & { rowCount: number }>
    const integrity = {
      algorithm: 'sha256' as const,
      checksum: checksumSnapshot({
        ...snapshotMeta,
        tables: integrityTables,
      }),
    }

    yield '{\n'
    yield `  "format": ${JSON.stringify(snapshotMeta.format)},\n`
    yield `  "version": ${snapshotMeta.version},\n`
    yield `  "createdAt": ${JSON.stringify(snapshotMeta.createdAt)},\n`
    yield `  "database": ${JSON.stringify(snapshotMeta.database)},\n`
    yield `  "app": ${JSON.stringify(snapshotMeta.app, null, 2).replace(/\n/g, '\n  ')},\n`
    yield `  "schema": ${JSON.stringify(snapshotMeta.schema, null, 2).replace(/\n/g, '\n  ')},\n`
    yield `  "integrity": ${JSON.stringify(integrity, null, 2).replace(/\n/g, '\n  ')},\n`
    yield `  "excludedContent": ${JSON.stringify(snapshotMeta.excludedContent, null, 2).replace(/\n/g, '\n  ')},\n`
    yield `  "accountingMode": ${JSON.stringify(snapshotMeta.accountingMode)},\n`
    yield '  "tables": [\n'

    for (const [tableIndex, table] of tableDefinitions.entries()) {
      const stats = tableStats.get(table.name)!
      if (tableIndex > 0) yield ',\n'
      yield '    {\n'
      yield `      "name": ${JSON.stringify(table.name)},\n`
      yield `      "columns": ${JSON.stringify(table.columns, null, 2).replace(/\n/g, '\n      ')},\n`
      yield '      "rows": ['

      let rowIndex = 0
      for await (const row of streamTableRows(table)) {
        if (rowIndex === 0) yield '\n'
        if (rowIndex > 0) yield ',\n'
        yield `        ${JSON.stringify(row, null, 2).replace(/\n/g, '\n        ')}`
        rowIndex += 1
      }

      if (rowIndex > 0) yield '\n      '
      yield `],\n      "checksum": ${JSON.stringify(stats.checksum)}\n`
      yield '    }'
    }

    yield '\n  ]\n'
    yield '}\n'
  })())
}

async function getTableColumns(conn?: mariadb.PoolConnection) {
  const database = process.env.DB_NAME

  let rows: TableColumn[]
  try {
    rows = await query<TableColumn[]>(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, ORDINAL_POSITION AS ordinal_position
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME IN (
           SELECT TABLE_NAME
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ?
             AND TABLE_TYPE = 'BASE TABLE'
         )
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database, database],
      conn,
    )
  } catch (err) {
    translateDatabaseError(err)
  }

  const tables = new Map<string, string[]>()
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, [])
    tables.get(row.table_name)!.push(row.column_name)
  }

  return [...tables.entries()].map(([name, columns]) => ({ name, columns }))
}

function validateSnapshot(value: unknown): DatabaseSnapshot {
  if (!value || typeof value !== 'object') throw new SnapshotError('unsupportedFormat', 'Invalid snapshot payload')

  const snapshot = value as DatabaseSnapshot
  if (snapshot.format !== SNAPSHOT_FORMAT || !SUPPORTED_SNAPSHOT_VERSIONS.has(Number(snapshot.version))) {
    throw new SnapshotError('unsupportedFormat', 'Unsupported snapshot format')
  }
  if (!Array.isArray(snapshot.tables)) throw new SnapshotError('unsupportedFormat', 'Snapshot tables are missing')
  if (snapshot.tables.length === 0) throw new SnapshotError('emptySnapshot', 'Snapshot contains no tables')

  for (const table of snapshot.tables) {
    if (!table || typeof table.name !== 'string' || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
      throw new SnapshotError('unsupportedFormat', 'Snapshot contains an invalid table entry')
    }
    try {
      quoteIdentifier(table.name)
      table.columns.forEach(quoteIdentifier)
    } catch {
      throw new SnapshotError('unsupportedFormat', `Snapshot contains invalid identifiers for table ${table.name}`)
    }
    if (table.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new SnapshotError('unsupportedFormat', `Snapshot contains invalid rows for table ${table.name}`)
    }
  }

  return snapshot
}

export function previewDatabaseSnapshot(value: unknown): SnapshotPreview {
  const snapshot = validateSnapshot(value)
  const integrityChecksum = snapshot.integrity?.checksum || null
  const integrityValid = integrityChecksum ? checksumSnapshot(snapshot) === integrityChecksum : false

  if (snapshot.integrity && snapshot.integrity.algorithm !== 'sha256') {
    throw new SnapshotError('unsupportedFormat', 'Unsupported snapshot checksum algorithm')
  }

  for (const table of snapshot.tables) {
    if (table.checksum && table.checksum !== sha256(tablePayload(table))) {
      throw new SnapshotError('integrityFailed', `Snapshot checksum does not match table ${table.name}`)
    }
  }

  return {
    ok: true,
    format: snapshot.format,
    version: Number(snapshot.version),
    createdAt: typeof snapshot.createdAt === 'string' ? snapshot.createdAt : null,
    database: typeof snapshot.database === 'string' ? snapshot.database : null,
    appName: snapshot.app?.name || null,
    appVersion: snapshot.app?.version || null,
    schemaVersion: snapshot.schema?.version || null,
    schemaChecksum: snapshot.schema?.checksum || null,
    tables: snapshot.tables.length,
    rows: snapshot.tables.reduce((sum, table) => (
      CONTENT_EXCLUDED_TABLES.has(table.name) ? sum : sum + table.rows.length
    ), 0),
    excludedContent: Array.isArray(snapshot.excludedContent) ? snapshot.excludedContent : [],
    accountingMode: snapshot.accountingMode === 'connected' || snapshot.accountingMode === 'standalone' ? snapshot.accountingMode : null,
    currentAccountingMode: currentAccountingModeLabel(),
    integrity: {
      present: Boolean(integrityChecksum),
      valid: integrityValid,
      algorithm: snapshot.integrity?.algorithm || null,
      checksum: integrityChecksum,
    },
  }
}

export async function assertSnapshotMatchesCurrentSchema(snapshot: DatabaseSnapshot, conn?: mariadb.PoolConnection) {
  const currentTables = await getTableColumns(conn)
  const currentTableMap = new Map(currentTables.map(table => [table.name, table.columns]))
  const snapshotTableMap = new Map(snapshot.tables.map(table => [table.name, table]))

  const missingTables = currentTables.filter(table => !snapshotTableMap.has(table.name)).map(table => table.name)
  const unknownTables = snapshot.tables.filter(table => !currentTableMap.has(table.name)).map(table => table.name)
  if (missingTables.length || unknownTables.length) {
    const parts: string[] = []
    if (missingTables.length) parts.push(`tables missing from snapshot: ${missingTables.join(', ')}`)
    if (unknownTables.length) parts.push(`tables in snapshot not in DB: ${unknownTables.join(', ')}`)
    throw new SnapshotError('schemaMismatch', `Snapshot schema does not match this app database`, { details: parts.join(' | ') })
  }

  for (const table of snapshot.tables) {
    const currentColumns = currentTableMap.get(table.name)!
    const currentColumnKey = currentColumns.join('|')
    const snapshotColumnKey = table.columns.join('|')
    if (currentColumnKey !== snapshotColumnKey) {
      const currentColumnSet = new Set(currentColumns)
      const snapshotColumnSet = new Set(table.columns)
      const addedColumns = currentColumns.filter(col => !snapshotColumnSet.has(col))
      const removedColumns = table.columns.filter(col => !currentColumnSet.has(col))
      const parts: string[] = [`table: ${table.name}`]
      if (addedColumns.length) parts.push(`columns added since snapshot: ${addedColumns.join(', ')}`)
      if (removedColumns.length) parts.push(`columns removed since snapshot: ${removedColumns.join(', ')}`)
      if (!addedColumns.length && !removedColumns.length) parts.push(`column order differs — DB: [${currentColumns.join(', ')}], snapshot: [${table.columns.join(', ')}]`)
      throw new SnapshotError('schemaMismatch', `Snapshot columns do not match table ${table.name}`, { details: parts.join(' | ') })
    }
  }

  return { currentTables, snapshotTableMap }
}

export async function previewDatabaseSnapshotForCurrentSchema(value: unknown) {
  const snapshot = validateSnapshot(value)
  const preview = previewDatabaseSnapshot(snapshot)
  await assertSnapshotMatchesCurrentSchema(snapshot)
  return preview
}

let restoreInProgress = false

export async function restoreDatabaseSnapshot(value: unknown) {
  const snapshot = validateSnapshot(value)
  const preview = previewDatabaseSnapshot(snapshot)
  if (preview.integrity.present && !preview.integrity.valid) {
    throw new SnapshotError('integrityFailed', 'Snapshot integrity check failed')
  }

  if (restoreInProgress) throw new SnapshotError('restoreInProgress', 'Another restore is already running')
  restoreInProgress = true

  try {
    return await withTransaction(async (conn) => {
      const { currentTables, snapshotTableMap } = await assertSnapshotMatchesCurrentSchema(snapshot, conn)

      try {
        await query('SET FOREIGN_KEY_CHECKS = 0', [], conn)

        for (const table of [...currentTables].reverse()) {
          await query(`DELETE FROM ${quoteIdentifier(table.name)}`, [], conn)
        }

        for (const table of currentTables) {
          const snapshotTable = snapshotTableMap.get(table.name)!
          const rows = CONTENT_EXCLUDED_TABLES.has(table.name) ? [] : snapshotTable.rows
          if (!rows.length) continue

          const columnList = table.columns.map(quoteIdentifier).join(', ')
          const placeholderList = table.columns.map(() => '?').join(', ')
          const sql = `INSERT INTO ${quoteIdentifier(table.name)} (${columnList}) VALUES (${placeholderList})`

          for (const row of rows) {
            try {
              await query(sql, table.columns.map(column => row[column] ?? null), conn)
            } catch (err) {
              translateDatabaseError(err, table.name)
            }
          }
        }
      } catch (err) {
        translateDatabaseError(err)
      } finally {
        await query('SET FOREIGN_KEY_CHECKS = 1', [], conn)
      }

      return {
        ok: true as const,
        tables: snapshot.tables.length,
        rows: snapshot.tables.reduce((sum, table) => (
          CONTENT_EXCLUDED_TABLES.has(table.name) ? sum : sum + table.rows.length
        ), 0),
      }
    })
  } catch (err) {
    translateDatabaseError(err)
  } finally {
    restoreInProgress = false
  }
}
