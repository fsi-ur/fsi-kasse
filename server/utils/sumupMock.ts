import { randomUUID } from 'node:crypto'
import type { SumupClient, SumupReader, SumupTransaction } from '~/server/utils/sumup'

/**
 * SUMUP_MODE=mock: a simulated terminal for development, kept in memory (a
 * server restart forgets everything). A checkout settles after 4 s, by the
 * last two digits of the cents:
 *   …13 → FAILED, …37 → stays PENDING, …50 → success with a 10 % tip,
 *   …77 → the card is never presented: no transaction, and the reader
 *         checkout fails once its 60 s window is over,
 *   …99 → success with a wrong amount (exercises the mismatch path),
 *   anything else → success.
 * The fee shows up a minute after the success (exercises "Gebühren aktualisieren").
 * Pairing code MOCK0001 pairs. The mock never calls the webhook, so the
 * polling fallback is what books; POST /api/sumup/mock-webhook triggers it.
 */

const SETTLE_MS = 4_000
/** SumUp: the device has 60 s to start the payment after a checkout is accepted. */
const CHECKOUT_WINDOW_MS = 60_000
const FEE_DELAY_MS = 60_000
const MOCK_FEE_RATE = 0.0139

interface MockTransaction {
  readerId: string
  cents: number
  createdAt: number
  terminated: boolean
}

const readers = new Map<string, SumupReader>()
const transactions = new Map<string, MockTransaction>()
const checkouts = new Map<string, string>()

function neverPresented(tx: MockTransaction) {
  return tx.cents % 100 === 77 && !tx.terminated
}

function settle(tx: MockTransaction): SumupTransaction {
  const elapsed = Date.now() - tx.createdAt
  const ending = tx.cents % 100
  const base = { amount: tx.cents / 100, tipAmount: 0, feeAmount: null, transactionId: null, transactionCode: null }

  if (tx.terminated) return { ...base, status: 'CANCELLED' }
  if (elapsed < SETTLE_MS || ending === 37) return { ...base, status: 'PENDING' }
  if (ending === 13) return { ...base, status: 'FAILED' }

  const tipCents = ending === 50 ? Math.round(tx.cents * 0.1) : 0
  const chargedCents = tx.cents + tipCents + (ending === 99 ? 100 : 0)
  const feeAmount = elapsed >= SETTLE_MS + FEE_DELAY_MS ? Math.round(chargedCents * MOCK_FEE_RATE) / 100 : null
  const code = `MOCK${String(tx.createdAt).slice(-6)}`

  return {
    status: 'SUCCESSFUL',
    amount: chargedCents / 100,
    tipAmount: tipCents / 100,
    feeAmount,
    transactionId: `mock-${tx.createdAt}`,
    transactionCode: code,
  }
}

export const mockSumup: SumupClient = {
  async pairReader(code, name) {
    if (code.trim().toUpperCase() !== 'MOCK0001') {
      return { ok: false, error: 'Koppeln fehlgeschlagen – Code prüfen (Mock: MOCK0001)', status: 422 }
    }
    const reader: SumupReader = {
      id: `rdr_mock_${randomUUID().slice(0, 8)}`,
      name,
      status: 'paired',
      serial: `MOCK-${randomUUID().slice(0, 6).toUpperCase()}`,
      model: 'virtual-solo',
    }
    readers.set(reader.id, reader)
    return { ok: true, reader }
  },

  async getReader(id) {
    return { ok: true, reader: readers.get(id) ?? { id, name: 'Mock', status: 'paired', serial: null, model: 'virtual-solo' } }
  },

  async getReaderStatus() {
    return {
      ok: true,
      status: {
        status: 'ONLINE',
        state: 'IDLE',
        battery_level: 87,
        connection_type: 'Wi-Fi',
        firmware_version: '3.3.40.0',
        last_activity: new Date().toISOString(),
      },
    }
  },

  async deleteReader(id) {
    readers.delete(id)
    return { ok: true }
  },

  async createReaderCheckout(readerId, input) {
    const clientTransactionId = randomUUID()
    const checkoutId = randomUUID()
    transactions.set(clientTransactionId, { readerId, cents: input.cents, createdAt: Date.now(), terminated: false })
    checkouts.set(checkoutId, clientTransactionId)
    return { ok: true, clientTransactionId, checkoutId }
  },

  async getReaderCheckout(_readerId, checkoutId) {
    const tx = transactions.get(checkouts.get(checkoutId) ?? '')
    if (!tx) return { ok: true, checkout: null }
    if (neverPresented(tx)) {
      const expired = Date.now() - tx.createdAt >= CHECKOUT_WINDOW_MS
      return { ok: true, checkout: { status: expired ? 'failed' : 'pending', failureReason: expired ? 'TIMEOUT' : null } }
    }
    const status = settle(tx).status
    const mapped = status === 'SUCCESSFUL' ? 'successful' : status === 'CANCELLED' ? 'cancelled' : status === 'FAILED' ? 'failed' : 'pending'
    return { ok: true, checkout: { status: mapped, failureReason: mapped === 'failed' ? 'DECLINED' : null } }
  },

  async terminateReaderCheckout(readerId) {
    for (const tx of transactions.values()) {
      if (tx.readerId === readerId && settle(tx).status === 'PENDING') tx.terminated = true
    }
    return { ok: true }
  },

  async getTransaction(clientTransactionId) {
    const tx = transactions.get(clientTransactionId)
    // A card that is never presented leaves no transaction at all.
    return { ok: true, transaction: tx && !neverPresented(tx) ? settle(tx) : null }
  },
}
