// Contract of the accounting integration API (/api/integration/v1/…).
//
// The till describes its event overview as a list of generic building blocks
// (stat tiles, tables, lists, a bar chart, …) with every label already
// translated. The Buchhaltung only knows how to draw those blocks, so new
// figures, sections or wording ship with the till alone — no Buchhaltung
// release needed. Only a new *kind* of block needs both apps.
//
// The Buchhaltung keeps a copy of these types in shared/cashRegisterView.ts.
// Compatible changes (new optional fields, new sections built from existing
// block types) keep CONTRACT_VERSION; the Buchhaltung skips block types it
// does not know. Anything that changes the meaning of an existing field needs
// a new version (and a /v2 route).

export const INTEGRATION_CONTRACT_VERSION = 1

export type ViewTone = 'default' | 'muted' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

/**
 * - `number`/`currency` render with the viewer's locale.
 * - `signedNumber`/`signedCurrency` always show the sign (deltas).
 * - `percent` expects a fraction (0.25 ⇒ 25 %).
 */
export type ViewValueFormat = 'text' | 'number' | 'signedNumber' | 'currency' | 'signedCurrency' | 'percent'

export interface ViewValue {
  value: number | string | null
  format?: ViewValueFormat
  tone?: ViewTone
  /** Shown before / after the formatted value, e.g. "~" or "Stk.". */
  prefix?: string
  suffix?: string
}

/** A plain string is text, a plain number is formatted as `number`. */
export type ViewCell = ViewValue | string | number | null

/** Clicking something with a `filter` sets that filter and reloads the view. */
export interface ViewFilterAction {
  key: string
  value: string
}

export interface ViewFilter {
  key: string
  label: string
  value: string
  options: Array<{ value: string, label: string }>
  /** Shown next to the select while a value other than the first option is chosen. */
  activeNote?: string
}

export interface ViewStatTile {
  label: string
  value: ViewCell
  meta?: string
  /** A material-symbols icon name, e.g. `material-symbols:euro-rounded`. */
  icon?: string
  tone?: ViewTone
}

export interface ViewTableColumn {
  label: string
  align?: 'left' | 'right'
}

export interface ViewTableRow {
  key: string
  cells: ViewCell[]
  /** 0–100: draws a bar below the row (rankings). */
  bar?: number
  /** A small line of text below the row. */
  note?: string
  /** A badge next to the first cell. */
  badge?: { label: string, tone?: ViewTone }
  filter?: ViewFilterAction
  selected?: boolean
}

export type ViewBlock =
  | {
      type: 'table'
      title?: string
      columns: ViewTableColumn[]
      rows: ViewTableRow[]
      footer?: ViewCell[]
      empty?: string
      notes?: string[]
    }
  | {
      type: 'list'
      title?: string
      items: Array<{
        label: string
        value: ViewCell
        style?: 'normal' | 'strong' | 'muted' | 'indent'
        tone?: ViewTone
      }>
      notes?: string[]
    }
  | {
      type: 'metric'
      label?: string
      value: ViewCell
      caption?: string
      tone?: ViewTone
    }
  | {
      /** Vertical bars along an hourly time axis. */
      type: 'hourlyChart'
      title?: string
      /** `hour` is an ISO instant (start of the hour, UTC); the viewer shows it in its own time zone. */
      points: Array<{ hour: string, value: number, caption?: string }>
      valueFormat?: ViewValueFormat
      empty?: string
      notes?: string[]
    }
  | {
      type: 'text'
      text: string
      tone?: ViewTone
      style?: 'normal' | 'note'
    }

export type ViewSection =
  | {
      type: 'stats'
      id: string
      items: ViewStatTile[]
    }
  | {
      type: 'alert'
      id: string
      text: string
      tone?: ViewTone
      icon?: string
    }
  | {
      type: 'card'
      id: string
      title: string
      icon?: string
      tone?: ViewTone
      /** `half` cards sit side by side on wide screens. */
      width?: 'full' | 'half'
      /** Blocks are laid out in up to two columns on wide screens. */
      columns?: 1 | 2
      blocks: ViewBlock[]
    }

/**
 * Typed figures the Buchhaltung may rely on and calculate with (as opposed to
 * `sections`, which are for display only). Always for the whole event,
 * independent of the filters.
 */
export interface IntegrationEventTotals {
  /** Cash and card taken for orders (sales, voucher sales, net deposit). */
  orderRevenue: number
  orderRevenueCash: number
  orderRevenueCard: number
  /** Deposit taken minus paid back; part of orderRevenue. */
  depositNet: number
  donations: number
  fachschaftPayments: number
  fachschaftPaymentCount: number
  /** Worth of the items handed out to the Fachschaft (never paid). */
  fachschaftGivenOutWorth: number
  /** orderRevenue + donations + fachschaftPayments. */
  totalIncome: number
}

export type IntegrationEventOverviewResponse =
  | { ok: true, contractVersion: number, linked: false }
  | {
      ok: true
      contractVersion: number
      linked: true
      event: { id: number, name: string }
      generatedAt: string
      totals: IntegrationEventTotals
      filters: ViewFilter[]
      sections: ViewSection[]
    }
  | { ok: false, error: string }
