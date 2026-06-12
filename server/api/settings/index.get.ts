import { defineEventHandler } from 'h3'
import { requirePermission, hasPermission } from '~/server/utils/api/guards'
import { getCashRegisterSettings } from '~/server/utils/appSettings'
import { isConnectedAccountingMode } from '~/server/utils/db'
import type { CashRegisterSettingsError, CashRegisterSettingsResponse } from '~/types/settings'

export default defineEventHandler(async (event): Promise<CashRegisterSettingsResponse | CashRegisterSettingsError> => {
  const current = await requirePermission(event, 'cash_register.use')
  if (!current.ok) return current

  const settings = await getCashRegisterSettings()

  return {
    ok: true,
    settings,
    can_manage: hasPermission(current.user, 'cash_register.manage'),
    accounting_mode: isConnectedAccountingMode() ? 'connected' : 'standalone',
  }
})
