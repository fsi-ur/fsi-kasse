import * as mariadb from 'mariadb'

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 5)
})

export async function query<T = any>(sql: string, params?: unknown[], conn?: mariadb.PoolConnection): Promise<T> {
  let connection = conn
  let shouldRelease = false

  try {
    if (!connection) {
      connection = await pool.getConnection()
      shouldRelease = true
    }

    return await connection.query(sql, params)
  } finally {
    if (shouldRelease && connection) connection.release()
  }
}

export async function withTransaction<T>(callback: (conn: mariadb.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()
    const result = await callback(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
