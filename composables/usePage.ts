export const usePage = () => {
  const currentPage = useState<string>('currentPage', () => 'Checkout')

  const { user } = useAuth()

  const setPage = (page: string) => {
    currentPage.value = page
  }

  return { currentPage, setPage }
}