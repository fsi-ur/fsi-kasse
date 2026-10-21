import { mockSumup } from '~/server/utils/sumupMock'

/**
 * The only file that talks to SumUp's API. Credentials come from the server
 * environment and are never returned to a client or written to a log.
 * SUMUP_MODE=mock swaps in server/utils/sumupMock.ts behind the same interface.
 */

const SUMUP_API_BASE = 'https://api.sumup.com'
const REQUEST_TIMEOUT_MS = 10_000

export interface SumupConfig {
  mode: 'real' | 'mock'
  apiKey: string
  merchantCode: string
  affiliateAppId: string
  affiliateKey: string
  /** Public origin incl. the app's base path, without a trailing slash. */
  webhookBaseUrl: string
}

export function sumupConfig(): SumupConfig {
  return {
    mode: (process.env.SUMUP_MODE || 'real').toLowerCase() === 'mock' ? 'mock' : 'real',
    apiKey: process.env.SUMUP_API_KEY || '',
    merchantCode: process.env.SUMUP_MERCHANT_CODE || '',
    affiliateAppId: process.env.SUMUP_AFFILIATE_APP_ID || '',
    affiliateKey: process.env.SUMUP_AFFILIATE_KEY || '',
    webhookBaseUrl: (process.env.SUMUP_WEBHOOK_BASE_URL || '').replace(/\/+$/, ''),
  }
}

/** Mock mode, or every real credential set. Otherwise every card UI and endpoint is off. */
export function isCardConfigured() {
  const config = sumupConfig()
  if (config.mode === 'mock') return true
  return Boolean(config.apiKey && config.merchantCode && config.affiliateAppId && config.affiliateKey && config.webhookBaseUrl)
}

export const CARD_NOT_CONFIGURED_ERROR = 'Kartenzahlung ist nicht eingerichtet'

export interface SumupReader {
  id: string
  name: string
  /** processing | paired | expired | unknown */
  status: string
  serial: string | null
  model: string | null
}

export interface SumupReaderStatus {
  /** ONLINE | OFFLINE */
  status: string
  /** IDLE, SELECTING_TIP, WAITING_FOR_CARD, WAITING_FOR_PIN, … */
  state: string | null
  battery_level: number | null
  connection_type: string | null
  firmware_version: string | null
  last_activity: string | null
}

export type SumupTransactionStatus = 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'REFUNDED' | string

export interface SumupTransaction {
  status: SumupTransactionStatus
  /** Major units, including the tip. */
  amount: number
  tipAmount: number
  /** null until SumUp reports it (usually only at payout). */
  feeAmount: number | null
  transactionId: string | null
  transactionCode: string | null
}

/** The checkout pushed to a reader: pending until the card is presented, then its outcome. */
export interface SumupReaderCheckout {
  /** pending | successful | failed | cancelled */
  status: string
  failureReason: string | null
}

export type SumupResult<T> = { ok: true } & T | { ok: false, error: string, status: number | null }

export interface ReaderCheckoutInput {
  cents: number
  tipRates: number[]
  returnUrl: string | null
  foreignId: string
  description: string
}

export interface SumupClient {
  pairReader(code: string, name: string): Promise<SumupResult<{ reader: SumupReader }>>
  getReader(id: string): Promise<SumupResult<{ reader: SumupReader }>>
  getReaderStatus(id: string): Promise<SumupResult<{ status: SumupReaderStatus }>>
  deleteReader(id: string): Promise<SumupResult<object>>
  createReaderCheckout(readerId: string, input: ReaderCheckoutInput): Promise<SumupResult<{ clientTransactionId: string, checkoutId: string | null }>>
  /** null = SumUp does not know the checkout. */
  getReaderCheckout(readerId: string, checkoutId: string): Promise<SumupResult<{ checkout: SumupReaderCheckout | null }>>
  terminateReaderCheckout(readerId: string): Promise<SumupResult<object>>
  /** null = SumUp has no such transaction (yet). */
  getTransaction(clientTransactionId: string): Promise<SumupResult<{ transaction: SumupTransaction | null }>>
}

/** SumUp answers errors as problem+json (`type`, `title`, `detail`) or as `{ error_code, message }`. */
function isReaderOffline(body: any) {
  return String(body?.type ?? '').endsWith('reader-offline') || body?.title === 'Reader Offline'
}

function errorMessage(body: any, fallback: string) {
  const message = body?.detail ?? body?.message ?? body?.error_message ?? body?.title
  return typeof message === 'string' && message ? message : fallback
}

async function request(method: string, path: string, body?: unknown) {
  const config = sumupConfig()
  try {
    const response = await $fetch.raw<any>(`${SUMUP_API_BASE}${path}`, {
      method: method as any,
      body: body as any,
      headers: { Authorization: `Bearer ${config.apiKey}` },
      timeout: REQUEST_TIMEOUT_MS,
      retry: 0,
      ignoreResponseError: true,
    })
    const data = response._data
    if (response.status >= 400) {
      // The body is logged to identify undocumented error codes; it never contains the key.
      console.warn(`[sumup] ${method} ${path.replace(config.merchantCode, '<merchant>')} → ${response.status}`, JSON.stringify(data ?? null).slice(0, 1000))
    }
    return { status: response.status, data }
  } catch (error: any) {
    console.warn(`[sumup] ${method} ${path.replace(config.merchantCode, '<merchant>')} failed: ${error?.message ?? error}`)
    return { status: null, data: null }
  }
}

function merchantPath(suffix: string) {
  return `/v0.1/merchants/${encodeURIComponent(sumupConfig().merchantCode)}${suffix}`
}

function normalizeReader(data: any): SumupReader {
  return {
    id: String(data?.id ?? ''),
    name: String(data?.name ?? ''),
    status: String(data?.status ?? 'unknown'),
    serial: data?.device?.identifier == null ? null : String(data.device.identifier),
    model: data?.device?.model == null ? null : String(data.device.model),
  }
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeTransaction(data: any): SumupTransaction {
  return {
    status: String(data?.status ?? 'PENDING').toUpperCase(),
    amount: toNumber(data?.amount) ?? 0,
    tipAmount: toNumber(data?.tip_amount) ?? 0,
    feeAmount: toNumber(data?.fee_amount),
    transactionId: data?.id == null ? null : String(data.id),
    transactionCode: data?.transaction_code == null ? null : String(data.transaction_code),
  }
}

const unreachable = 'Terminal nicht erreichbar oder beschäftigt'
const readerOffline = 'Terminal ist offline'
const readerUnknown = 'Terminal ist bei SumUp nicht (mehr) bekannt – bitte neu koppeln'
const apiUnavailable = 'SumUp ist nicht erreichbar'

const realSumup: SumupClient = {
  async pairReader(code, name) {
    const res = await request('POST', merchantPath('/readers'), { pairing_code: code, name })
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, 'Koppeln fehlgeschlagen – Code prüfen'), status: res.status }
    return { ok: true, reader: normalizeReader(res.data) }
  },

  async getReader(id) {
    const res = await request('GET', merchantPath(`/readers/${encodeURIComponent(id)}`))
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, 'Terminal nicht gefunden'), status: res.status }
    return { ok: true, reader: normalizeReader(res.data) }
  },

  async getReaderStatus(id) {
    const res = await request('GET', merchantPath(`/readers/${encodeURIComponent(id)}/status`))
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, 'Status nicht verfügbar'), status: res.status }
    const data = res.data?.data ?? res.data ?? {}
    return {
      ok: true,
      status: {
        status: String(data.status ?? 'OFFLINE'),
        state: data.state == null ? null : String(data.state),
        battery_level: toNumber(data.battery_level),
        connection_type: data.connection_type == null ? null : String(data.connection_type),
        firmware_version: data.firmware_version == null ? null : String(data.firmware_version),
        last_activity: data.last_activity == null ? null : String(data.last_activity),
      },
    }
  },

  async deleteReader(id) {
    const res = await request('DELETE', merchantPath(`/readers/${encodeURIComponent(id)}`))
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    // Already gone at SumUp is what we wanted.
    if (res.status >= 400 && res.status !== 404) return { ok: false, error: errorMessage(res.data, 'Löschen fehlgeschlagen'), status: res.status }
    return { ok: true }
  },

  async createReaderCheckout(readerId, input) {
    const config = sumupConfig()
    const body: Record<string, unknown> = {
      total_amount: { currency: 'EUR', minor_unit: 2, value: input.cents },
      affiliate: { app_id: config.affiliateAppId, key: config.affiliateKey, foreign_transaction_id: input.foreignId },
      description: input.description,
    }
    if (input.tipRates.length) body.tip_rates = input.tipRates
    if (input.returnUrl) body.return_url = input.returnUrl

    const res = await request('POST', merchantPath(`/readers/${encodeURIComponent(readerId)}/checkout`), body)
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    // Documented: 404 = reader not found, 422 = validation. Offline/busy (the
    // 60 s window of another checkout) have no documented status, so every
    // other 4xx is the generic message; the body is logged above.
    if (res.status === 404) return { ok: false, error: readerUnknown, status: res.status }
    if (isReaderOffline(res.data)) return { ok: false, error: readerOffline, status: res.status }
    if (res.status >= 400) return { ok: false, error: res.status >= 500 ? apiUnavailable : unreachable, status: res.status }

    const clientTransactionId = res.data?.data?.client_transaction_id
    if (!clientTransactionId) return { ok: false, error: apiUnavailable, status: res.status }
    const checkoutId = res.data?.data?.checkout_id
    return { ok: true, clientTransactionId: String(clientTransactionId), checkoutId: checkoutId ? String(checkoutId) : null }
  },

  async getReaderCheckout(readerId, checkoutId) {
    const res = await request('GET', merchantPath(`/readers/${encodeURIComponent(readerId)}/checkout/${encodeURIComponent(checkoutId)}`))
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (res.status === 404) return { ok: true, checkout: null }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, apiUnavailable), status: res.status }
    const data = res.data?.data ?? res.data ?? {}
    return {
      ok: true,
      checkout: {
        status: String(data.status ?? 'pending').toLowerCase(),
        failureReason: data.payment_failure_reason == null ? null : String(data.payment_failure_reason),
      },
    }
  },

  async terminateReaderCheckout(readerId) {
    const res = await request('POST', merchantPath(`/readers/${encodeURIComponent(readerId)}/terminate`))
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (isReaderOffline(res.data)) return { ok: false, error: readerOffline, status: res.status }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, 'Abbrechen am Terminal nicht möglich'), status: res.status }
    return { ok: true }
  },

  async getTransaction(clientTransactionId) {
    const code = encodeURIComponent(sumupConfig().merchantCode)
    const res = await request('GET', `/v2.1/merchants/${code}/transactions?client_transaction_id=${encodeURIComponent(clientTransactionId)}`)
    if (res.status == null) return { ok: false, error: apiUnavailable, status: null }
    if (res.status === 404) return { ok: true, transaction: null }
    if (res.status >= 400) return { ok: false, error: errorMessage(res.data, apiUnavailable), status: res.status }
    // The endpoint answers with the transaction itself; tolerate a list shape too.
    const data = Array.isArray(res.data?.items) ? res.data.items[0] : res.data
    return { ok: true, transaction: data ? normalizeTransaction(data) : null }
  },
}

export function sumup(): SumupClient {
  return sumupConfig().mode === 'mock' ? mockSumup : realSumup
}
