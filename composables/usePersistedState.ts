import { effectScope, type Ref } from 'vue'

const persistedKeys = new Set<string>()

export function usePersistedState<T>(
  key: string,
  init: () => T,
  restore: (stored: unknown) => T | undefined = stored => stored as T,
): Ref<T> {
  const storageKey = `kasse-${key}`

  const state = useState<T>(key, () => {
    if (!import.meta.client) return init()
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === null) return init()
      return restore(JSON.parse(raw)) ?? init()
    } catch {
      return init()
    }
  })

  if (import.meta.client && !persistedKeys.has(key)) {
    persistedKeys.add(key)
    // Detached scope: the first caller is some component, and its unmount must
    // not stop the persistence for the rest of the session.
    effectScope(true).run(() => {
      watch(state, (value) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(value))
        } catch {
          // storage blocked — the value just won't survive a reload
        }
      }, { deep: true })
    })
  }

  return state
}

export function positiveIdOrEmpty(value: unknown): number | '' {
  return Number(value) > 0 ? Number(value) : ''
}
