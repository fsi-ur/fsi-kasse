export const usePage = () => {
  const currentPage = useState<string>('currentPage', () => 'Checkout')
  const pageMeta = useState<Record<string, any> | null>('currentPageMeta', () => null)

  const setPage = (page: string, meta?: Record<string, any>) => {
    currentPage.value = page
    pageMeta.value = meta || null
  }

  return { currentPage, setPage, pageMeta }
}
