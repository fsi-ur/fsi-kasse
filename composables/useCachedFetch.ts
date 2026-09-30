import { get, set, clear } from 'idb-keyval'
import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'
import { useConnectivity } from '~/composables/useConnectivity'
import { getCacheStore, toPlain } from '~/utils/offlineStorage'
import { isRetryableError, OFFLINE_REQUEST_TIMEOUT_MS } from '~/utils/network'

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

export interface CachedFetchResult<T> {
  data: T
  stale: boolean
  cachedAt: number | null
}

export async function cachedFetch<T = any>(
  url: string,
  opts: NitroFetchOptions<NitroFetchRequest, 'get'> = {},
): Promise<CachedFetchResult<T>> {
  const { markOffline, markOnline } = useConnectivity()

  try {
    const data = await $fetch(url, {
      ...opts,
      method: 'GET',
      timeout: OFFLINE_REQUEST_TIMEOUT_MS,
      retry: 0,
    }) as T
    markOnline()

    if ((data as { ok?: unknown } | null)?.ok === true) {
      const cachedAt = Date.now()
      try {
        await set(url, toPlain({ data, cachedAt }), getCacheStore())
      } catch {
      }
      return { data, stale: false, cachedAt }
    }

    return { data, stale: false, cachedAt: null }
  } catch (err) {
    if (!isRetryableError(err)) throw err

    markOffline()

    let cached: CacheEntry<T> | undefined
    try {
      cached = await get<CacheEntry<T>>(url, getCacheStore())
    } catch {
      cached = undefined
    }
    if (!cached) throw err

    return { data: cached.data, stale: true, cachedAt: cached.cachedAt }
  }
}

export async function readCachedValue<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, getCacheStore())
  } catch {
    return undefined
  }
}

export async function writeCachedValue<T>(key: string, value: T) {
  try {
    await set(key, toPlain(value), getCacheStore())
  } catch {
  }
}

export async function clearOfflineCache() {
  try {
    await clear(getCacheStore())
  } catch {
  }
}
