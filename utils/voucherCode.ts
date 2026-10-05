// Voucher codes: 10 random characters + 1 check character (Luhn-style mod 31) over an
// alphabet without look-alikes (no 0/O, 1/I/L), stored bare and shown as
// XXXX-XXXX-XXX. Pure functions — shared by the client and the server.

export const VOUCHER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const VOUCHER_CODE_BODY_LENGTH = 10
export const VOUCHER_CODE_LENGTH = VOUCHER_CODE_BODY_LENGTH + 1

const BASE = VOUCHER_CODE_ALPHABET.length

function weightedSum(code: string, doubleFirst: boolean): number | null {
  let sum = 0
  let double = doubleFirst
  for (let index = code.length - 1; index >= 0; index -= 1) {
    const value = VOUCHER_CODE_ALPHABET.indexOf(code[index]!)
    if (value < 0) return null
    sum += double ? (value * 2) % BASE : value
    double = !double
  }
  return sum
}

/** The check character for a code body (the code without its last character). */
export function voucherCheckChar(body: string): string | null {
  const sum = weightedSum(body, true)
  if (sum == null) return null
  return VOUCHER_CODE_ALPHABET[(BASE - (sum % BASE)) % BASE]!
}

export type NormalizedVoucherCode =
  | { ok: true, code: string }
  | { ok: false, reason: 'empty' | 'length' | 'characters' | 'checksum' }

/** Uppercases, strips spaces/dashes and validates the alphabet and the check character. */
export function normalizeVoucherCode(input: unknown): NormalizedVoucherCode {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]+/g, '')
  if (!code) return { ok: false, reason: 'empty' }
  if ([...code].some(char => !VOUCHER_CODE_ALPHABET.includes(char))) return { ok: false, reason: 'characters' }
  if (code.length !== VOUCHER_CODE_LENGTH) return { ok: false, reason: 'length' }
  if (weightedSum(code, false)! % BASE !== 0) return { ok: false, reason: 'checksum' }
  return { ok: true, code }
}

export function formatVoucherCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}
