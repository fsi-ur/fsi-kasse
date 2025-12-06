export const usePage = () => {
  const currentPage = useState<string>('currentPage', () => 'Home')

  const { user } = useAuth()

  const setPage = (page: string) => {
    currentPage.value = page
  }

  return { currentPage, setPage }
}