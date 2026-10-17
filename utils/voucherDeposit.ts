// What happens to the deposit of items redeemed with a voucher of a batch:
// - customer: the customer pays the deposit in cash and gets it back on return.
// - covered:  the voucher pays the deposit; the container is still issued and
//             a return is refunded like any other.
// - none:     no deposit is issued at all — the line is booked with deposit 0
//             and nothing is refunded (the till does not enforce that).

export type VoucherDepositMode = 'customer' | 'covered' | 'none'

export const VOUCHER_DEPOSIT_MODES: VoucherDepositMode[] = ['customer', 'covered', 'none']

export function isVoucherDepositMode(value: unknown): value is VoucherDepositMode {
  return VOUCHER_DEPOSIT_MODES.includes(value as VoucherDepositMode)
}

/** The batch's mode, falling back to the legacy `includes_deposit` flag of older data. */
export function voucherDepositMode(batch: { deposit_mode?: unknown, includes_deposit?: unknown }): VoucherDepositMode {
  if (isVoucherDepositMode(batch.deposit_mode)) return batch.deposit_mode
  return batch.includes_deposit ? 'covered' : 'customer'
}

/** The customer pays no deposit in cash for a redemption of this batch. */
export function voucherSparesDepositCash(batch: { deposit_mode?: unknown, includes_deposit?: unknown }) {
  return voucherDepositMode(batch) !== 'customer'
}
