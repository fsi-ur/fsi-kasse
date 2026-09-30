import { del, set, values } from 'idb-keyval'
import { useConnectivity } from '~/composables/useConnectivity'
import { getOutboxStore, toPlain } from '~/utils/offlineStorage'
import { isRetryableError, OFFLINE_REQUEST_TIMEOUT_MS } from '~/utils/network'

export type OutboxKind = 'checkout' | 'fachschaft_payment'
export type OutboxStatus = 'pending' | 'failed'

export interface CheckoutPayload {
  client_uuid: string
  cashier_id: number
  event_id: number
  is_fachschaft: boolean
  /** unit_price/unit_deposit are what the cashier charged; the server books them. */
  items: Array<{ id: number, quantity: number, unit_price: number, unit_deposit: number }>
  donation:
    | null
    | { mode: 'direct', amount: number }
    | { mode: 'paid', paid_amount: number }
}

export interface FachschaftPayPayload {
  client_uuid: string
  cashier_id: number
  event_id: number
  member_id: number
  /** The amount the cashier collected; the server books it. */
  amount: number
}

export interface OutboxDisplay {
  cashierName: string
  eventName: string
  summary: string
  localTotal: number
}

export interface OutboxEntry {
  client_uuid: string
  kind: OutboxKind
  payload: CheckoutPayload | FachschaftPayPayload
  display: OutboxDisplay
  queued_at: number
  attempts: number
  status: OutboxStatus
  /** Server error string; null with status 'failed' means an unknown error. */
  last_error: string | null
}

export type SubmitResult =
  | { status: 'synced', result: any }
  | { status: 'rejected', error: string | null }
  | { status: 'queued' }

export interface FlushSummary {
  synced: Array<{ entry: OutboxEntry, result: any }>
  failed: OutboxEntry[]
}

type FlushListener = (summary: FlushSummary) => void

const ENDPOINTS: Record<OutboxKind, string> = {
  checkout: '/api/checkout/submit',
  fachschaft_payment: '/api/fachschaft/pay',
}

// A server that answers every attempt with a 5xx for one entry would otherwise
// block the whole FIFO queue forever.
const MAX_RETRYABLE_ATTEMPTS = 20

// Answers that mean "log in again", not "this sale is wrong". The auth plugin
// already redirects; the entry stays pending and the flush resumes after login.
const AUTH_ERRORS = new Set(['Not authenticated', 'Password change required'])

// Module-level singleton: the queue is per device, shared by every component.
const entries = ref<OutboxEntry[]>([])
const isFlushing = ref(false)
const pendingCount = computed(() => entries.value.filter(entry => entry.status === 'pending').length)
const failedCount = computed(() => entries.value.filter(entry => entry.status === 'failed').length)

// Entries currently on the wire, so submit() and flush() never send the same one twice at once.
const inFlight = new Set<string>()
const flushListeners = new Set<FlushListener>()
let loadPromise: Promise<void> | null = null
let flushPromise: Promise<FlushSummary> | null = null

function sortByQueuedAt(list: OutboxEntry[]) {
  return [...list].sort((a, b) => a.queued_at - b.queued_at)
}

async function readAll(): Promise<OutboxEntry[] | null> {
  try {
    return await values<OutboxEntry>(getOutboxStore())
  } catch {
    return null
  }
}

/** Loads the persisted outbox once; everything else awaits this first. */
function ready() {
  loadPromise ??= (async () => {
    const stored = await readAll()
    if (stored) entries.value = sortByQueuedAt(stored)
  })()
  return loadPromise
}

async function persist(entry: OutboxEntry) {
  try {
    await set(entry.client_uuid, toPlain(entry), getOutboxStore())
  } catch {
    // IndexedDB unavailable — the entry still lives in memory for this tab.
  }
}

async function removeEntry(clientUuid: string) {
  entries.value = entries.value.filter(entry => entry.client_uuid !== clientUuid)
  try {
    await del(clientUuid, getOutboxStore())
  } catch {
    // see persist
  }
}

function findEntry(clientUuid: string) {
  return entries.value.find(entry => entry.client_uuid === clientUuid)
}

function send(entry: OutboxEntry) {
  return $fetch<any>(ENDPOINTS[entry.kind], {
    method: 'POST',
    body: entry.payload,
    timeout: OFFLINE_REQUEST_TIMEOUT_MS,
    retry: 0,
  })
}

async function markFailed(entry: OutboxEntry, error: string | null) {
  entry.status = 'failed'
  entry.last_error = error
  await persist(entry)
}

async function submit(
  kind: OutboxKind,
  payload: CheckoutPayload | FachschaftPayPayload,
  display: OutboxDisplay,
): Promise<SubmitResult> {
  await ready()

  const { isOnline, markOffline, markOnline, probe } = useConnectivity()

  const entry: OutboxEntry = {
    client_uuid: payload.client_uuid,
    kind,
    payload,
    display,
    queued_at: Date.now(),
    attempts: 0,
    status: 'pending',
    last_error: null,
  }

  entries.value = [...entries.value, entry]
  await persist(entry)

  if (!isOnline.value) {
    probe()
    return { status: 'queued' }
  }

  inFlight.add(entry.client_uuid)
  try {
    const res = await send(entry)
    markOnline()

    if (res?.ok) {
      await removeEntry(entry.client_uuid)
      return { status: 'synced', result: res }
    }

    await removeEntry(entry.client_uuid)
    return { status: 'rejected', error: typeof res?.error === 'string' ? res.error : null }
  } catch (err) {
    if (!isRetryableError(err)) {
      await removeEntry(entry.client_uuid)
      return { status: 'rejected', error: null }
    }

    markOffline()
    return { status: 'queued' }
  } finally {
    inFlight.delete(entry.client_uuid)
  }
}

async function processQueue(): Promise<FlushSummary> {
  const summary: FlushSummary = { synced: [], failed: [] }
  const { markOffline, markOnline } = useConnectivity()

  const stored = await readAll()
  if (stored) {
    const storedIds = new Set(stored.map(entry => entry.client_uuid))
    const memoryOnly = entries.value.filter(entry => !storedIds.has(entry.client_uuid) && inFlight.has(entry.client_uuid))
    entries.value = sortByQueuedAt([...stored, ...memoryOnly])
  }

  const queue = entries.value.filter(entry => entry.status === 'pending')

  for (const snapshot of queue) {
    if (inFlight.has(snapshot.client_uuid)) continue
    const entry = findEntry(snapshot.client_uuid)
    if (!entry || entry.status !== 'pending') continue

    inFlight.add(entry.client_uuid)
    try {
      let res: any
      try {
        res = await send(entry)
      } catch (err) {
        if (!isRetryableError(err)) {
          await markFailed(entry, null)
          summary.failed.push(entry)
          continue
        }

        entry.attempts += 1
        if (entry.attempts >= MAX_RETRYABLE_ATTEMPTS) {
          await markFailed(entry, null)
          summary.failed.push(entry)
          continue
        }

        await persist(entry)
        markOffline()
        break
      }

      markOnline()

      if (res?.ok) {
        await removeEntry(entry.client_uuid)
        summary.synced.push({ entry, result: res })
        continue
      }

      const error = typeof res?.error === 'string' ? res.error : null
      if (error && AUTH_ERRORS.has(error)) break

      await markFailed(entry, error)
      summary.failed.push(entry)
    } finally {
      inFlight.delete(entry.client_uuid)
    }
  }

  return summary
}

function flush(): Promise<FlushSummary> {
  flushPromise ??= (async () => {
    await ready()
    isFlushing.value = true
    try {
      const summary = typeof navigator !== 'undefined' && navigator.locks?.request
        ? await navigator.locks.request('kasse-outbox', processQueue)
        : await processQueue()

      if (summary.synced.length || summary.failed.length) {
        for (const listener of flushListeners) listener(summary)
      }
      return summary
    } finally {
      isFlushing.value = false
      flushPromise = null
    }
  })()

  return flushPromise
}

async function retry(clientUuid: string) {
  await ready()
  const entry = findEntry(clientUuid)
  if (!entry) return

  entry.status = 'pending'
  entry.attempts = 0
  entry.last_error = null
  await persist(entry)
  await flush()
}

async function discard(clientUuid: string) {
  await ready()
  if (inFlight.has(clientUuid)) return
  await removeEntry(clientUuid)
}

function onFlushed(listener: FlushListener) {
  flushListeners.add(listener)
  return () => flushListeners.delete(listener)
}

export function onOfflineDataChanged(callback: () => void) {
  const stopOnline = useConnectivity().onOnline(callback)
  const stopFlushed = onFlushed(callback)

  onBeforeUnmount(() => {
    stopOnline()
    stopFlushed()
  })
}

export const useOfflineQueue = () => ({
  entries: readonly(entries),
  pendingCount,
  failedCount,
  isFlushing: readonly(isFlushing),
  ready,
  submit,
  flush,
  retry,
  discard,
  onFlushed,
})
