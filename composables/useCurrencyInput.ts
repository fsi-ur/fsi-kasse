import { nextTick } from 'vue'

interface SanitizeCurrencyInputOptions {
  allowNegative?: boolean
}

export function sanitizeCurrencyInput(rawValue: string, options: SanitizeCurrencyInputOptions = {}) {
  const isNegative = options.allowNegative === true && rawValue.trimStart().startsWith('-')
  let value = rawValue.replace(/[^0-9.,]/g, '')
  value = value.replace(',', '.')

  const parts = value.split('.')
  if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('')

  return isNegative ? `-${value}` : value
}

export function parseCurrencyInput(rawValue: string) {
  const parsed = parseFloat(sanitizeCurrencyInput(rawValue))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function focusAndSelectInput(event: FocusEvent) {
  nextTick(() => {
    const input = event.target as HTMLInputElement | null
    input?.select()
  })
}
