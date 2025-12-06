export const usePage = () => {
  const currentPage = useState<string>('currentPage', () => 'Home')

  const setPage = (page: string) => {
    currentPage.value = page
  }

  return { currentPage, setPage }
}