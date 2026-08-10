import type { PageName } from '~/types/page'

const currentPage = ref<PageName>('Checkout')
const pageMeta = ref<Record<string, any> | null>(null)

// Only these meta keys are persisted in the URL hash; ephemeral keys like resetTabKey are excluded
const HASH_META_KEYS = ['tab']

function buildHash(page: PageName, meta: Record<string, any> | null): string {
  const params = new URLSearchParams()
  if (meta) {
    for (const key of HASH_META_KEYS) {
      if (meta[key] != null) params.set(key, String(meta[key]))
    }
  }
  const paramStr = params.toString()
  return paramStr ? `${page}?${paramStr}` : page
}

export function parseDeepLinkHash(): { page: PageName; meta: Record<string, any> | null } | null {
  if (!import.meta.client) return null
  const hash = window.location.hash.slice(1)
  if (!hash) return null

  const [pageName, paramStr] = hash.split('?')
  if (!pageName) return null

  const meta: Record<string, any> = {}
  if (paramStr) {
    new URLSearchParams(paramStr).forEach((value, key) => {
      const num = Number(value)
      meta[key] = !isNaN(num) && value !== '' ? num : value
    })
  }

  return { page: pageName as PageName, meta: Object.keys(meta).length ? meta : null }
}

// Auto-initialize from hash on module load so components can read pageMeta during setup
if (import.meta.client) {
  const state = parseDeepLinkHash()
  if (state) {
    currentPage.value = state.page
    pageMeta.value = state.meta
  }
}

export const usePage = () => {
  const setPage = (page: PageName, meta?: Record<string, any>) => {
    currentPage.value = page
    pageMeta.value = meta || null
    // Skip hash update for Login so deep links survive auth redirects
    if (import.meta.client && page !== 'Login') {
      window.location.hash = buildHash(page, meta || null)
    }
  }

  return { currentPage, setPage, pageMeta }
}
