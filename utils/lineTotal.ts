// Client twin of lineCashTotal in server/utils/checkout.ts: the cash a
// customer pays for a line. A redeemed line is covered by the voucher — only
// its deposit is paid, unless the voucher covers that too.

export type LineKind = 'item' | 'voucher_redemption' | 'voucher_sale'

export function lineCashTotal(line: {
  kind?: LineKind | string | null
  quantity: number | string
  price: number | string
  deposit?: number | string | null
  coversDeposit?: boolean | number | null
}) {
  const quantity = Number(line.quantity)
  const deposit = Number(line.deposit ?? 0)
  const amount = line.kind === 'voucher_redemption'
    ? (line.coversDeposit ? 0 : quantity * deposit)
    : quantity * (Number(line.price) + deposit)
  return Math.round(amount * 100) / 100
}

/** What the line is worth at item prices (price + deposit), whoever pays for it. */
export function lineWorth(line: { quantity: number | string, price: number | string, deposit?: number | string | null }) {
  return Math.round(Number(line.quantity) * (Number(line.price) + Number(line.deposit ?? 0)) * 100) / 100
}
