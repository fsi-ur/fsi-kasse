export async function downloadFromApi(path: string, fallbackName: string): Promise<{ ok: true } | { ok: false, error: string | null }> {
  const base = String(useRuntimeConfig().app.baseURL || '/').replace(/\/$/, '')

  let res: Response
  try {
    res = await fetch(`${base}${path}`)
  } catch {
    return { ok: false, error: null }
  }

  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || contentType.includes('application/json')) {
    try {
      const data = await res.json()
      return { ok: false, error: typeof data?.error === 'string' ? data.error : null }
    } catch {
      return { ok: false, error: null }
    }
  }

  const disposition = res.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName
  saveBlob(await res.blob(), filename)
  return { ok: true }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
