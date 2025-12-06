import mariadb from 'mariadb'

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 5)
})

export async function query(sql: string, params?: any[]) {
  let conn
  try {
    conn = await pool.getConnection()
    return await conn.query(sql, params)
  } finally {
    if (conn) conn.release()
  }
}