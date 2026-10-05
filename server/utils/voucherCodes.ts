import { randomInt } from 'node:crypto'
import type * as mariadb from 'mariadb'
import { query } from '~/server/utils/db'
import { isDuplicateEntryError } from '~/server/utils/checkout'
import { VOUCHER_CODE_ALPHABET, VOUCHER_CODE_BODY_LENGTH, voucherCheckChar } from '~/utils/voucherCode'

/** Most codes a single batch may hold — keeps the ZIP export in memory at a sane size. */
export const MAX_VOUCHERS_PER_BATCH = 2000

const INSERT_CHUNK = 200
const MAX_COLLISION_RETRIES = 20

export function generateVoucherCode(): string {
  let body = ''
  for (let index = 0; index < VOUCHER_CODE_BODY_LENGTH; index += 1) {
    body += VOUCHER_CODE_ALPHABET[randomInt(VOUCHER_CODE_ALPHABET.length)]
  }
  return body + voucherCheckChar(body)
}

/**
 * Inserts `count` new vouchers into a batch, in chunks. A collision with an
 * existing code (≈49 bits, so practically never) fails the whole chunk on the
 * unique key; the chunk is then retried row by row with fresh codes.
 */
export async function insertVouchers(
  batch: { id: number, status: 'unsold' | 'active', units: number },
  count: number,
  conn: mariadb.PoolConnection,
) {
  const insertOne = (code: string) => query(
    `INSERT INTO vouchers (batch_id, code, status, units_total, units_remaining) VALUES (?, ?, ?, ?, ?)`,
    [batch.id, code, batch.status, batch.units, batch.units],
    conn,
  )

  for (let offset = 0; offset < count; offset += INSERT_CHUNK) {
    const size = Math.min(INSERT_CHUNK, count - offset)
    const codes = new Set<string>()
    while (codes.size < size) codes.add(generateVoucherCode())

    try {
      await query(
        `INSERT INTO vouchers (batch_id, code, status, units_total, units_remaining)
         VALUES ${[...codes].map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        [...codes].flatMap(code => [batch.id, code, batch.status, batch.units, batch.units]),
        conn,
      )
    } catch (err) {
      if (!isDuplicateEntryError(err)) throw err

      for (let code of codes) {
        for (let attempt = 0; ; attempt += 1) {
          try {
            await insertOne(code)
            break
          } catch (rowErr) {
            if (!isDuplicateEntryError(rowErr) || attempt >= MAX_COLLISION_RETRIES) throw rowErr
            code = generateVoucherCode()
          }
        }
      }
    }
  }
}
