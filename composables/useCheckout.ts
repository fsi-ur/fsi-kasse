import { positiveIdOrEmpty, usePersistedState } from '~/composables/usePersistedState'
import type { LineKind } from '~/utils/lineTotal'

export type DonationMode = 'direct' | 'paid' | null

/** A line of the persisted cart. */
export interface CartLine {
  key: string
  kind: LineKind
  /** Item id; null for a voucher sale. */
  id: number | null
  name: string
  /** For a redemption the item's price — its worth, not what the customer pays. */
  price: number
  deposit: number
  quantity: number
  /** Redemption: the voucher paying for the item. Sale: the voucher sold. */
  voucherCode?: string
  /** Redemption: the voucher also covers the deposit. */
  coversDeposit?: boolean
  /** Sale: the voucher's batch. */
  batchName?: string
  [key: string]: unknown
}

export function cartLineKey(kind: LineKind, itemId: number | null, voucherCode?: string | null) {
  return `${kind}:${itemId ?? ''}:${voucherCode ?? ''}`
}

function normalizeCartLine(stored: any): CartLine | null {
  if (!stored || typeof stored !== 'object') return null
  const kind: LineKind = stored.kind === 'voucher_redemption' || stored.kind === 'voucher_sale' ? stored.kind : 'item'
  const id = stored.id == null ? null : Number(stored.id)
  if (kind !== 'voucher_sale' && !(Number(id) > 0)) return null
  if (kind !== 'item' && typeof stored.voucherCode !== 'string') return null
  return {
    ...stored,
    kind,
    id,
    key: cartLineKey(kind, id, stored.voucherCode),
    price: Number(stored.price ?? 0),
    deposit: Number(stored.deposit ?? 0),
    quantity: Number(stored.quantity ?? 1),
  }
}

function nonNegativeAmount(stored: unknown) {
  const amount = Number(stored)
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

export const useCheckout = () => {
  const selectedCashier = usePersistedState<number | string>('selectedCashier', () => '', positiveIdOrEmpty)
  const selectedEvent = usePersistedState<number | string>('selectedEvent', () => '', positiveIdOrEmpty)
  const selectedStand = usePersistedState<number | string>('selectedStand', () => '', positiveIdOrEmpty)
  const showAllItems = usePersistedState<boolean>('showAllItems', () => false, stored => stored === true)
  const orderItems = usePersistedState<CartLine[]>('orderItems', () => [], stored => Array.isArray(stored)
    ? stored.map(normalizeCartLine).filter((line): line is CartLine => line !== null)
    : undefined)
  const isFachschaft = usePersistedState<boolean>('isFachschaft', () => false, stored => stored === true)
  const donationMode = usePersistedState<DonationMode>('donationMode', () => null,
    stored => stored === 'direct' || stored === 'paid' ? stored : undefined)
  const directDonation = usePersistedState<number>('directDonation', () => 0, nonNegativeAmount)
  const paidAmount = usePersistedState<number>('paidAmount', () => 0, nonNegativeAmount)
  const selectedCashierName = useState<string>('selectedCashierName', () => '')
  const selectedEventName = useState<string>('selectedEventName', () => '')

  return {
    selectedCashier, selectedEvent, selectedCashierName, selectedEventName, orderItems, isFachschaft,
    donationMode, directDonation, paidAmount, selectedStand, showAllItems,
  }
}
