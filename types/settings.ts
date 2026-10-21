export interface CashRegisterSettings {
  fachschaft_payment_amount: number
  fachschaft_enabled: boolean
  card_payments_enabled: boolean
  /** Tip rates offered on the terminal, ascending (0.01–0.99); empty = no tip prompt. */
  card_tip_rates: number[]
  /** Also offer the tip rates when the order already contains a donation (default off). */
  card_tip_with_donation: boolean
  /** Estimated SumUp fee in percent, used for payments whose actual fee is not known yet. */
  card_fee_rate: number
}

export interface CashRegisterSettingsResponse {
  ok: true
  settings: CashRegisterSettings
  can_manage: boolean
  accounting_mode: 'standalone' | 'connected'
  /** SumUp credentials (or the mock) are set on the server. */
  card_configured: boolean
}

export interface CashRegisterSettingsError {
  ok: false
  error: string
}
