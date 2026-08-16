import * as mariadb from 'mariadb'
import { normalizeBigInt } from '~/server/utils/normalize'

const accountingMode = (process.env.ACCOUNTING_MODE || 'standalone').toLowerCase()

function createPool(options: {
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  connectionLimit?: number
}) {
  return mariadb.createPool({
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionLimit: options.connectionLimit,
    dateStrings: true,
    timezone: 'UTC',
  })
}

const dataConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 5),
}

const accountingConfig = accountingMode === 'connected'
  ? {
      host: process.env.ACCOUNTING_DB_HOST || process.env.DB_HOST,
      port: Number(process.env.ACCOUNTING_DB_PORT || process.env.DB_PORT || 3306),
      user: process.env.ACCOUNTING_DB_USER || process.env.DB_USER,
      password: process.env.ACCOUNTING_DB_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.ACCOUNTING_DB_NAME || 'fsi_buchhaltung',
      connectionLimit: Number(process.env.ACCOUNTING_DB_CONN_LIMIT || process.env.DB_CONN_LIMIT || 5),
    }
  : dataConfig

const dataPool = createPool(dataConfig)
const accountingPool = accountingMode === 'connected'
  ? createPool(accountingConfig)
  : dataPool

async function runQuery<T = any>(pool: mariadb.Pool, sql: string, params?: unknown[], conn?: mariadb.PoolConnection): Promise<T> {
  let connection = conn
  let shouldRelease = false

  try {
    if (!connection) {
      connection = await pool.getConnection()
      shouldRelease = true
    }

    const result = await connection.query(sql, params)
    return normalizeBigInt(result)
  } finally {
    if (shouldRelease && connection) connection.release()
  }
}

async function runTransaction<T>(pool: mariadb.Pool, callback: (conn: mariadb.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()
    const result = await callback(conn)
    await conn.commit()
    return normalizeBigInt(result)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export function isConnectedAccountingMode() {
  return accountingMode === 'connected'
}

export async function getDbConnection(): Promise<mariadb.PoolConnection> {
  return dataPool.getConnection()
}

export async function query<T = any>(sql: string, params?: unknown[], conn?: mariadb.PoolConnection): Promise<T> {
  return runQuery<T>(dataPool, sql, params, conn)
}

export async function accountingQuery<T = any>(sql: string, params?: unknown[], conn?: mariadb.PoolConnection): Promise<T> {
  return runQuery<T>(accountingPool, sql, params, conn)
}

export async function withTransaction<T>(callback: (conn: mariadb.PoolConnection) => Promise<T>): Promise<T> {
  return runTransaction<T>(dataPool, callback)
}

export async function withAccountingTransaction<T>(callback: (conn: mariadb.PoolConnection) => Promise<T>): Promise<T> {
  return runTransaction<T>(accountingPool, callback)
}
