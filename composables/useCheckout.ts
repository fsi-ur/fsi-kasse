import { positiveIdOrEmpty, usePersistedState } from '~/composables/usePersistedState'

export type DonationMode = 'direct' | 'paid' | null

function nonNegativeAmount(stored: unknown) {
  const amount = Number(stored)
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

export const useCheckout = () => {
  const selectedCashier = usePersistedState<number | string>('selectedCashier', () => '', positiveIdOrEmpty)
  const selectedEvent = usePersistedState<number | string>('selectedEvent', () => '', positiveIdOrEmpty)
  const orderItems = usePersistedState<any[]>('orderItems', () => [], stored => Array.isArray(stored) ? stored : undefined)
  const isFachschaft = usePersistedState<boolean>('isFachschaft', () => false, stored => stored === true)
  const donationMode = usePersistedState<DonationMode>('donationMode', () => null,
    stored => stored === 'direct' || stored === 'paid' ? stored : undefined)
  const directDonation = usePersistedState<number>('directDonation', () => 0, nonNegativeAmount)
  const paidAmount = usePersistedState<number>('paidAmount', () => 0, nonNegativeAmount)
  const selectedCashierName = useState<string>('selectedCashierName', () => '')
  const selectedEventName = useState<string>('selectedEventName', () => '')

  return {
    selectedCashier, selectedEvent, selectedCashierName, selectedEventName, orderItems, isFachschaft,
    donationMode, directDonation, paidAmount,
  }
}
