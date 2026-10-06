import * as mariadb from 'mariadb'

const {
  DB_HOST = 'kasse-db',
  DB_PORT = '3306',
  DB_USER = 'fsi',
  DB_PASSWORD = 'fsi_password',
  DB_NAME = 'fsi_kasse',
  DB_CONN_LIMIT = '2',
} = process.env

// Till-owned in both modes: event_id references the local events row, which is
// a proxy of the accounting event in connected mode.
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS event_affiliations (
    event_id BIGINT UNSIGNED NOT NULL,
    affiliation_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (event_id, affiliation_id),
    INDEX idx_event_affiliations_affiliation (affiliation_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (affiliation_id) REFERENCES affiliations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS event_affiliation_stands (
    event_id BIGINT UNSIGNED NOT NULL,
    affiliation_id BIGINT UNSIGNED NOT NULL,
    stand_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (event_id, affiliation_id, stand_id),
    INDEX idx_event_affiliation_stands_affiliation (affiliation_id, stand_id),
    INDEX idx_event_affiliation_stands_stand (stand_id),
    CONSTRAINT fk_event_affiliation_stands_access FOREIGN KEY (event_id, affiliation_id)
      REFERENCES event_affiliations(event_id, affiliation_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_affiliation_stands_stand FOREIGN KEY (stand_id) REFERENCES stands(id) ON DELETE CASCADE
  )`,
]

async function migrateEventAffiliations() {
  const pool = mariadb.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: Number(DB_CONN_LIMIT),
  })

  let conn

  try {
    conn = await pool.getConnection()

    for (const statement of CREATE_TABLES) {
      await conn.query(statement)
    }

    console.log('migrate-event-affiliations: complete')
  } finally {
    if (conn) conn.release()
    await pool.end()
  }
}

migrateEventAffiliations().catch((error) => {
  const errorCode = error?.code || error?.cause?.code
  if (errorCode === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR' || errorCode === 'ER_ACCESS_DENIED_ERROR') {
    console.error(
      `migrate-event-affiliations: database authentication failed for user "${DB_USER}". ` +
      'Check DB_HOST/DB_PORT/DB_NAME and the DB_PASSWORD value in .env.',
    )
  }

  console.error('migrate-event-affiliations: failed', error)
  process.exit(1)
})
