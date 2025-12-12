export const useCheckout = () => {
  const selectedCashier = useState<number | string>('selectedCashier', () => '')
  const orderItems = useState<any[]>('orderItems', () => [])
  const isFachschaft = useState<boolean>('isFachschaft', () => false)

  return {
    selectedCashier, orderItems, isFachschaft
  }
}