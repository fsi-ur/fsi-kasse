import { query, withTransaction } from '~/server/utils/db'
import type { CashRegisterSettings } from '~/types/settings'

const SETTING_KEYS = {
  fachschaft_payment_amount: 'fachschaft_payment_amount',
  fachschaft_enabled: 'fachschaft_enabled',
} as const

export const DEFAULT_CASH_REGISTER_SETTINGS: CashRegisterSettings = {
  fachschaft_payment_amount: 10,
  fachschaft_enabled: true,
}

export function normalizeCashRegisterSettings(input: Partial<CashRegisterSettings> | null | undefined): CashRegisterSettings {
  const amount = Number(input?.fachschaft_payment_amount)

  return {
    fachschaft_payment_amount: Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100) / 100
      : DEFAULT_CASH_REGISTER_SETTINGS.fachschaft_payment_amount,
    fachschaft_enabled: input?.fachschaft_enabled ?? DEFAULT_CASH_REGISTER_SETTINGS.fachschaft_enabled,
  }
}

export async function getCashRegisterSettings(conn?: any): Promise<CashRegisterSettings> {
  let rows: Array<{ setting_key: string, setting_value: string | null }> = []
  try {
    rows = await query<Array<{ setting_key: string, setting_value: string | null }>>(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN (${Object.values(SETTING_KEYS).map(() => '?').join(',')})`,
      Object.values(SETTING_KEYS),
      conn,
    )
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err
    return DEFAULT_CASH_REGISTER_SETTINGS
  }

  const values = new Map(rows.map(row => [row.setting_key, row.setting_value || '']))

  return normalizeCashRegisterSettings({
    fachschaft_payment_amount: Number(values.get(SETTING_KEYS.fachschaft_payment_amount)),
    fachschaft_enabled: values.get(SETTING_KEYS.fachschaft_enabled) !== '0',
  })
}

export async function isKnownFachschaftPaymentAmount(amount: number) {
  const cents = Math.round(amount * 100)
  const toCents = (value: unknown) => Math.round(Number(value) * 100)

  if (cents === toCents(DEFAULT_CASH_REGISTER_SETTINGS.fachschaft_payment_amount)) return true

  const settings = await getCashRegisterSettings()
  if (cents === toCents(settings.fachschaft_payment_amount)) return true

  let rows: Array<{ setting_value: string | null }> = []
  try {
    rows = await query<Array<{ setting_value: string | null }>>(
      `SELECT setting_value FROM app_settings_history WHERE setting_key = ?`,
      [SETTING_KEYS.fachschaft_payment_amount],
    )
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err
  }

  return rows.some(row => row.setting_value !== null && toCents(row.setting_value) === cents)
}

export async function saveCashRegisterSettings(
  settings: Partial<CashRegisterSettings>,
  changedBy?: string | null,
): Promise<CashRegisterSettings> {
  const normalized = normalizeCashRegisterSettings(settings)
  const newValues: Array<[string, string]> = [
    [SETTING_KEYS.fachschaft_payment_amount, String(normalized.fachschaft_payment_amount)],
    [SETTING_KEYS.fachschaft_enabled, normalized.fachschaft_enabled ? '1' : '0'],
  ]

  // History is an audit trail only — every payment already carries its own
  // amount snapshot, so correctness never depends on this table.
  await withTransaction(async (conn) => {
    for (const [key, newValue] of newValues) {
      const existingRows = await query<Array<{ setting_value: string | null }>>(
        `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
        [key],
        conn,
      )
      const previousValue = existingRows[0]?.setting_value ?? null

      await query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, newValue],
        conn,
      )

      if (previousValue !== newValue) {
        await query(
          `INSERT INTO app_settings_history (setting_key, setting_value, changed_by) VALUES (?, ?, ?)`,
          [key, newValue, changedBy ?? null],
          conn,
        )
      }
    }
  })

  return normalized
}
