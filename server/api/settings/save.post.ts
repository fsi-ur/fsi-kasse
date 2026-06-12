import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { saveCashRegisterSettings } from '~/server/utils/appSettings'
import type { CashRegisterSettings } from '~/types/settings'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody<Partial<CashRegisterSettings>>(event)

  const amount = Number(body?.fachschaft_payment_amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, error: 'Invalid fachschaft payment amount' }
  }

  const settings = await saveCashRegisterSettings({ fachschaft_payment_amount: amount })

  return { ok: true as const, settings }
})
