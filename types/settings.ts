export interface CashRegisterSettings {
  fachschaft_payment_amount: number
  fachschaft_enabled: boolean
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
