export type DateInputMode = 'date' | 'datetime'

type DateParts = {
  day: number
  month: number
  year: number
}

type TimeParts = {
  hour: number
  minute: number
}

type NormalizedDateInput = {
  display: string
  canonical: string | null
}

type DateDraft = {
  dayDigits: string
  monthDigits: string
  yearDigits: string
  completeDay: boolean
  hadDaySeparator: boolean
  showYearSeparator: boolean
  completeMonth: boolean
  consumedDigits: number
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function expandYear(year: number) {
  if (year >= 100) return year
  return year >= 50 ? 1900 + year : 2000 + year
}

function isValidDateParts(parts: DateParts) {
  if (parts.month < 1 || parts.month > 12) return false
  if (parts.day < 1 || parts.day > 31) return false

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day
}

function isValidTimeParts(parts: TimeParts) {
  return parts.hour >= 0 && parts.hour <= 23 && parts.minute >= 0 && parts.minute <= 59
}

function formatDisplayDate(parts: DateParts) {
  return `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year}`
}

function formatCanonicalDate(parts: DateParts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

function formatDisplayDateTime(date: DateParts, time: TimeParts) {
  return `${formatDisplayDate(date)} ${pad2(time.hour)}:${pad2(time.minute)}`
}

function formatCanonicalDateTime(date: DateParts, time: TimeParts) {
  return `${formatCanonicalDate(date)} ${pad2(time.hour)}:${pad2(time.minute)}:00`
}

function normalizeRawValue(rawValue: string) {
  return rawValue
    .replace(/[\/-]/g, '.')
    .replace(/[Tt]/g, ' ')
    .replace(/[^0-9.: ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDatePartsFromTokens(dayToken: string, monthToken: string, yearToken: string): DateParts | null {
  const day = Number(dayToken)
  const month = Number(monthToken)
  const year = expandYear(Number(yearToken))
  const parts = { day, month, year }
  return isValidDateParts(parts) ? parts : null
}

function parseTimeParts(rawValue: string): TimeParts | null {
  const normalized = normalizeRawValue(rawValue)
  if (!normalized) return null

  const tokenMatch = normalized.match(/^(\d{1,2})[:.](\d{2})$/)
  if (tokenMatch) {
    const parts = {
      hour: Number(tokenMatch[1]),
      minute: Number(tokenMatch[2]),
    }
    return isValidTimeParts(parts) ? parts : null
  }

  const digits = normalized.replace(/\D/g, '')
  if (digits.length === 4) {
    const parts = {
      hour: Number(digits.slice(0, 2)),
      minute: Number(digits.slice(2, 4)),
    }
    return isValidTimeParts(parts) ? parts : null
  }

  return null
}

function parseFinalTimeParts(rawValue: string): TimeParts | null {
  const normalized = normalizeRawValue(rawValue)
  if (!normalized) return null

  const tokenMatch = normalized.match(/^(\d{1,2})(?:[:.](\d{0,2}))?$/)
  if (tokenMatch) {
    const hour = Number(tokenMatch[1])
    const minute = Number((tokenMatch[2] ?? '').padEnd(2, '0') || '0')
    const parts = { hour, minute }
    return isValidTimeParts(parts) ? parts : null
  }

  const digits = normalized.replace(/\D/g, '')
  if (!digits) return null

  if (digits.length <= 2) {
    const parts = {
      hour: Number(digits),
      minute: 0,
    }
    return isValidTimeParts(parts) ? parts : null
  }

  if (digits.length === 3) {
    const firstTwoHour = Number(digits.slice(0, 2))
    if (firstTwoHour <= 23) {
      const parts = {
        hour: firstTwoHour,
        minute: Number(digits.slice(2)) * 10,
      }
      return isValidTimeParts(parts) ? parts : null
    }

    const parts = {
      hour: Number(digits.slice(0, 1)),
      minute: Number(digits.slice(1)),
    }
    return isValidTimeParts(parts) ? parts : null
  }

  return parseTimeParts(rawValue)
}

function formatPartialDate(rawValue: string) {
  const normalized = normalizeRawValue(rawValue)
  if (normalized.includes('.')) {
    const [dayRaw = '', monthRaw = '', yearRaw = ''] = normalized.split('.')
    const day = dayRaw.replace(/\D/g, '').slice(0, 2)
    const month = monthRaw.replace(/\D/g, '').slice(0, 2)
    const year = yearRaw.replace(/\D/g, '').slice(0, 4)

    if (yearRaw || normalized.split('.').length > 2) {
      return `${day}.${month}.${year}`.replace(/\.+$/, '')
    }

    if (monthRaw || normalized.endsWith('.')) {
      return `${day}.${month}`.replace(/\.+$/, normalized.endsWith('.') ? '.' : '')
    }
  }

  const digits = normalized.replace(/\D/g, '').slice(0, 8)

  if (!digits) return ''
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

function parseDateDraft(rawValue: string): DateDraft {
  const normalized = normalizeRawValue(rawValue)
  if (!normalized) {
    return {
      dayDigits: '',
      monthDigits: '',
      yearDigits: '',
      completeDay: false,
      hadDaySeparator: false,
      showYearSeparator: false,
      completeMonth: false,
      consumedDigits: 0,
    }
  }

  if (normalized.includes('.')) {
    const segments = normalized.split('.')
    const dayDigits = (segments[0] ?? '').replace(/\D/g, '').slice(0, 2)
    const monthDigits = (segments[1] ?? '').replace(/\D/g, '').slice(0, 2)
    const yearDigits = (segments[2] ?? '').replace(/\D/g, '').slice(0, 4)
    const dayValue = Number(dayDigits)
    const hasMonthSegment = Boolean(monthDigits)
    const completeDay = dayDigits.length === 2
      || (dayDigits.length === 1 && (dayValue >= 4 || hasMonthSegment || normalized.endsWith('.')))
    const monthValue = Number(monthDigits)
    const completeMonth = monthDigits.length === 2 || (monthDigits.length === 1 && monthValue >= 2)

    return {
      dayDigits,
      monthDigits,
      yearDigits,
      completeDay,
      hadDaySeparator: normalized.includes('.'),
      showYearSeparator: segments.length > 2 || completeMonth,
      completeMonth,
      consumedDigits: dayDigits.length + monthDigits.length + yearDigits.length,
    }
  }

  const digits = normalized.replace(/\D/g, '').slice(0, 8)
  const firstDayDigit = digits[0] ?? ''
  if (firstDayDigit >= '4' && firstDayDigit <= '9') {
    const dayDigits = firstDayDigit
    const remainder = digits.slice(1)
    const firstMonthDigit = remainder[0] ?? ''

    if (!remainder) {
      return {
        dayDigits,
        monthDigits: '',
        yearDigits: '',
        completeDay: true,
        hadDaySeparator: false,
        showYearSeparator: false,
        completeMonth: false,
        consumedDigits: 1,
      }
    }

    if (firstMonthDigit >= '2' && firstMonthDigit <= '9') {
      const monthDigits = firstMonthDigit
      const yearDigits = remainder.slice(1, 5)
      return {
        dayDigits,
        monthDigits,
        yearDigits,
        completeDay: true,
        hadDaySeparator: false,
        showYearSeparator: true,
        completeMonth: true,
        consumedDigits: Math.min(digits.length, 2 + yearDigits.length),
      }
    }

    const monthDigits = remainder.slice(0, 2)
    const yearDigits = remainder.slice(2, 6)
    return {
      dayDigits,
      monthDigits,
      yearDigits,
      completeDay: true,
      hadDaySeparator: false,
      showYearSeparator: monthDigits.length === 2,
      completeMonth: monthDigits.length === 2,
      consumedDigits: Math.min(digits.length, 3 + yearDigits.length),
    }
  }

  const dayDigits = digits.slice(0, 2)
  const remainder = digits.slice(2)

  if (!remainder) {
    return {
      dayDigits,
      monthDigits: '',
      yearDigits: '',
      completeDay: dayDigits.length === 2,
      hadDaySeparator: false,
      showYearSeparator: false,
      completeMonth: false,
      consumedDigits: dayDigits.length,
    }
  }

  const firstMonthDigit = remainder[0] ?? ''
  if (firstMonthDigit >= '2' && firstMonthDigit <= '9') {
    const monthDigits = firstMonthDigit
    const yearDigits = remainder.slice(1, 5)
    return {
      dayDigits,
      monthDigits,
      yearDigits,
      completeDay: dayDigits.length === 2,
      hadDaySeparator: false,
      showYearSeparator: true,
      completeMonth: true,
      consumedDigits: Math.min(digits.length, 3 + yearDigits.length),
    }
  }

  const monthDigits = remainder.slice(0, 2)
  const yearDigits = remainder.slice(2, 6)
  return {
    dayDigits,
    monthDigits,
    yearDigits,
    completeDay: dayDigits.length === 2,
    hadDaySeparator: false,
    showYearSeparator: monthDigits.length === 2,
    completeMonth: monthDigits.length === 2,
    consumedDigits: Math.min(digits.length, 4 + yearDigits.length),
  }
}

function formatDateDraft(draft: DateDraft, yearDigitsOverride?: string) {
  const yearDigits = yearDigitsOverride ?? draft.yearDigits
  let display = draft.completeDay && draft.dayDigits.length === 1
    ? pad2(Number(draft.dayDigits))
    : draft.dayDigits

  if ((draft.completeDay || draft.dayDigits.length === 2) && (draft.monthDigits.length > 0 || draft.hadDaySeparator)) {
    display += '.'
  }

  display += draft.completeMonth && draft.monthDigits.length === 1
    ? pad2(Number(draft.monthDigits))
    : draft.monthDigits

  if (draft.showYearSeparator && draft.monthDigits.length > 0) {
    display += '.'
  }

  display += yearDigits
  return display
}

function resolveCanonicalDate(draft: DateDraft, yearDigits: string) {
  if (!draft.dayDigits || !draft.monthDigits || yearDigits.length !== 4) return null
  return parseDatePartsFromTokens(draft.dayDigits, draft.monthDigits, yearDigits)
}

function formatPartialTime(rawValue: string) {
  const normalized = normalizeRawValue(rawValue)
  const separatorMatch = normalized.match(/^(\d{1,2})[:.](\d{0,2})$/)
  if (separatorMatch) {
    const hourDigits = (separatorMatch[1] ?? '').slice(0, 2)
    const minuteDigits = (separatorMatch[2] ?? '').slice(0, 2)
    return `${hourDigits}:${minuteDigits}`
  }

  const digits = normalized.replace(/\D/g, '').slice(0, 4)

  if (!digits) return ''
  if (digits.length === 1) {
    const hourDigit = Number(digits)
    if (hourDigit >= 3) return `${pad2(hourDigit)}:`
    return digits
  }
  if (digits.length === 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function normalizeDateInput(rawValue: string, mode: DateInputMode, finalize = false): NormalizedDateInput {
  const hadTrailingSpace = /\s$/.test(rawValue)
  const normalized = normalizeRawValue(rawValue)
  if (!normalized) return { display: '', canonical: null }

  if (mode === 'date') {
    const draft = parseDateDraft(normalized)
    const shouldExpandYear = finalize && draft.yearDigits.length === 2
    const yearDigits = shouldExpandYear ? String(expandYear(Number(draft.yearDigits))) : draft.yearDigits
    const dateParts = resolveCanonicalDate(draft, yearDigits)

    if (dateParts) {
      return {
        display: formatDisplayDate(dateParts),
        canonical: formatCanonicalDate(dateParts),
      }
    }

    return {
      display: formatDateDraft(draft, yearDigits) || formatPartialDate(normalized),
      canonical: null,
    }
  }

  const explicitTimeSeparator = normalized.includes(' ') || hadTrailingSpace
  const [rawDatePart, ...rest] = normalized.split(' ')
  const safeRawDatePart = rawDatePart ?? ''
  const draft = parseDateDraft(safeRawDatePart)
  const autoExpandedYear = draft.yearDigits.length === 2 && (explicitTimeSeparator || finalize)
    ? String(expandYear(Number(draft.yearDigits)))
    : draft.yearDigits
  const compactDigits = normalized.replace(/\D/g, '')
  const compactTimeRaw = (!explicitTimeSeparator && autoExpandedYear.length === 4)
    ? compactDigits.slice(draft.consumedDigits).slice(0, 4)
    : ''
  const timeRaw = explicitTimeSeparator
    ? rest.join('').replace(/\s/g, '')
    : compactTimeRaw
  const dateParts = resolveCanonicalDate(draft, autoExpandedYear)
  const timeParts = finalize ? parseFinalTimeParts(timeRaw) : parseTimeParts(timeRaw)
  const showTimeSeparator = explicitTimeSeparator || (autoExpandedYear.length === 4 && Boolean(dateParts))

  if (dateParts && timeParts) {
    return {
      display: formatDisplayDateTime(dateParts, timeParts),
      canonical: formatCanonicalDateTime(dateParts, timeParts),
    }
  }

  const dateDisplay = dateParts
    ? formatDisplayDate(dateParts)
    : formatDateDraft(draft, autoExpandedYear) || formatPartialDate(safeRawDatePart)
  const timeDisplay = timeParts ? `${pad2(timeParts.hour)}:${pad2(timeParts.minute)}` : formatPartialTime(timeRaw)

  return {
    display: showTimeSeparator
      ? `${dateDisplay}${timeDisplay ? ` ${timeDisplay}` : ' '}`
      : [dateDisplay, timeDisplay].filter(Boolean).join(' ').trim(),
    canonical: null,
  }
}

export function formatStoredDateInput(value: string | null | undefined, mode: DateInputMode) {
  if (!value) return ''

  const normalized = String(value).trim().replace('T', ' ')

  if (mode === 'date') {
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return ''

    return `${match[3]}.${match[2]}.${match[1]}`
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/)
  if (!match) return ''

  const hour = match[4] ?? '00'
  const minute = match[5] ?? '00'
  return `${match[3]}.${match[2]}.${match[1]} ${hour}:${minute}`
}
