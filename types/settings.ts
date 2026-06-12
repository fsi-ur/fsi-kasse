export interface CashRegisterSettings {
  fachschaft_payment_amount: number
}

export interface CashRegisterSettingsResponse {
  ok: true
  settings: CashRegisterSettings
  can_manage: boolean
  accounting_mode: 'standalone' | 'connected'
}

export interface CashRegisterSettingsError {
  ok: false
  error: string
}
