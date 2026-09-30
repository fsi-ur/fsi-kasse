import { createStore, type UseStore } from 'idb-keyval'

// Two separate IndexedDB databases: the outbox holds unsynced sales and must
// survive logout, the cache holds last-known API responses and the session
// user and is wiped whenever the session is really gone.
let outboxStore: UseStore | null = null
let cacheStore: UseStore | null = null

export function getOutboxStore() {
  outboxStore ??= createStore('kasse-outbox', 'entries')
  return outboxStore
}

export function getCacheStore() {
  cacheStore ??= createStore('kasse-cache', 'entries')
  return cacheStore
}

/** IndexedDB can only store plain data, not Vue proxies. */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
