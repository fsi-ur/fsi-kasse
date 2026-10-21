import { defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~/server/utils/api/guards'
import { getCashRegisterSettings, isValidCardFeeRate, normalizeCardTipRates, saveCashRegisterSettings } from '~/server/utils/appSettings'
import type { CashRegisterSettings } from '~/types/settings'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const body = await readBody<Partial<CashRegisterSettings>>(event)

  const amount = Number(body?.fachschaft_payment_amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, error: 'Invalid fachschaft payment amount' }
  }

  if (body?.fachschaft_enabled !== undefined && typeof body.fachschaft_enabled !== 'boolean') {
    return { ok: false as const, error: 'Invalid fachschaft enabled flag' }
  }

  if (body?.card_payments_enabled !== undefined && typeof body.card_payments_enabled !== 'boolean') {
    return { ok: false as const, error: 'Invalid card payments flag' }
  }

  const tipRates = body?.card_tip_rates === undefined ? undefined : normalizeCardTipRates(body.card_tip_rates)
  if (tipRates === null) {
    return { ok: false as const, error: 'Ungültige Trinkgeldsätze (keine oder genau 3 verschiedene, je 1–99 %)' }
  }

  if (body?.card_tip_with_donation !== undefined && typeof body.card_tip_with_donation !== 'boolean') {
    return { ok: false as const, error: 'Invalid tip with donation flag' }
  }

  if (body?.card_fee_rate !== undefined && !isValidCardFeeRate(body.card_fee_rate)) {
    return { ok: false as const, error: 'Ungültiger Gebührensatz' }
  }

  const previous = await getCashRegisterSettings()
  const settings = await saveCashRegisterSettings({
    fachschaft_payment_amount: amount,
    fachschaft_enabled: body?.fachschaft_enabled ?? previous.fachschaft_enabled,
    card_payments_enabled: body?.card_payments_enabled ?? previous.card_payments_enabled,
    card_tip_rates: tipRates ?? previous.card_tip_rates,
    card_tip_with_donation: body?.card_tip_with_donation ?? previous.card_tip_with_donation,
    card_fee_rate: body?.card_fee_rate ?? previous.card_fee_rate,
  }, current.user?.username ?? null)

  return { ok: true as const, settings }
})
