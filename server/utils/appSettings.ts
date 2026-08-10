import { query, withTransaction } from '~/server/utils/db'
import type { CashRegisterSettings } from '~/types/settings'

const SETTING_KEYS = {
  fachschaft_payment_amount: 'fachschaft_payment_amount',
} as const

export const DEFAULT_CASH_REGISTER_SETTINGS: CashRegisterSettings = {
  fachschaft_payment_amount: 10,
}

export function normalizeCashRegisterSettings(input: Partial<CashRegisterSettings> | null | undefined): CashRegisterSettings {
  const amount = Number(input?.fachschaft_payment_amount)

  return {
    fachschaft_payment_amount: Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100) / 100
      : DEFAULT_CASH_REGISTER_SETTINGS.fachschaft_payment_amount,
  }
}

export async function getCashRegisterSettings(conn?: any): Promise<CashRegisterSettings> {
  let rows: Array<{ setting_key: string, setting_value: string | null }> = []
  try {
    rows = await query<Array<{ setting_key: string, setting_value: string | null }>>(
      `SELECT setting_key, setting_value
       FROM app_settings
       WHERE setting_key IN (?)`,
      [SETTING_KEYS.fachschaft_payment_amount],
      conn,
    )
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err
    return DEFAULT_CASH_REGISTER_SETTINGS
  }

  const values = new Map(rows.map(row => [row.setting_key, row.setting_value || '']))

  return normalizeCashRegisterSettings({
    fachschaft_payment_amount: Number(values.get(SETTING_KEYS.fachschaft_payment_amount)),
  })
}

export async function saveCashRegisterSettings(
  settings: Partial<CashRegisterSettings>,
  changedBy?: string | null,
): Promise<CashRegisterSettings> {
  const normalized = normalizeCashRegisterSettings(settings)
  const newValue = String(normalized.fachschaft_payment_amount)

  // History is an audit trail only — every payment already carries its own
  // amount snapshot, so correctness never depends on this table.
  await withTransaction(async (conn) => {
    const existingRows = await query<Array<{ setting_value: string | null }>>(
      `SELECT setting_value FROM app_settings WHERE setting_key = ?`,
      [SETTING_KEYS.fachschaft_payment_amount],
      conn,
    )
    const previousValue = existingRows[0]?.setting_value ?? null

    await query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SETTING_KEYS.fachschaft_payment_amount, newValue],
      conn,
    )

    if (previousValue !== newValue) {
      await query(
        `INSERT INTO app_settings_history (setting_key, setting_value, changed_by) VALUES (?, ?, ?)`,
        [SETTING_KEYS.fachschaft_payment_amount, newValue, changedBy ?? null],
        conn,
      )
    }
  })

  return normalized
}
