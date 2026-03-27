import * as mariadb from 'mariadb'
import { normalizeBigInt } from '~/server/utils/normalize'

const accountingMode = (process.env.ACCOUNTING_MODE || 'standalone').toLowerCase()
const accountingDatabase = accountingMode === 'connected'
  ? (process.env.ACCOUNTING_DB_NAME || 'fsi_buchhaltung')
  : process.env.DB_NAME

function createPool(database: string | undefined) {
  return mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    connectionLimit: Number(process.env.DB_CONN_LIMIT || 5),
    dateStrings: true,
  })
}

const dataPool = createPool(process.env.DB_NAME)
const accountingPool = accountingDatabase === process.env.DB_NAME ? dataPool : createPool(accountingDatabase)

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
