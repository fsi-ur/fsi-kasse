import type { CashRegisterSettings, CashRegisterSettingsError, CashRegisterSettingsResponse } from '~/types/settings'

const FALLBACK_SETTINGS: CashRegisterSettings = {
  fachschaft_payment_amount: 10,
}

export const useCashRegisterSettings = () => {
  const settings = useState<CashRegisterSettings>('cash_register_settings', () => ({ ...FALLBACK_SETTINGS }))
  const canManage = useState<boolean>('cash_register_settings_can_manage', () => false)
  const accountingMode = useState<'standalone' | 'connected'>('cash_register_settings_mode', () => 'standalone')
  const loaded = useState<boolean>('cash_register_settings_loaded', () => false)

  async function loadSettings(force = false) {
    if (loaded.value && !force) return settings.value

    try {
      const res = await $fetch<CashRegisterSettingsResponse | CashRegisterSettingsError>('/api/settings')
      if (res.ok) {
        settings.value = res.settings
        canManage.value = res.can_manage
        accountingMode.value = res.accounting_mode
        loaded.value = true
      }
    } catch {
      // keep fallback settings if the request fails
    }

    return settings.value
  }

  return { settings, canManage, accountingMode, loaded, loadSettings }
}
