import { normalizeHexColor } from '~/utils/voucherColors'

// Where the PDF stamper puts QR codes, stored on the batch so a re-export only
// needs the PDF re-selected. Coordinates are in pt, top-left based relative to
// the page's CropBox (what the editor works in); voucherPdf.ts converts them to
// pdf-lib's bottom-left origin only when drawing.

export type VoucherPdfMode = 'template' | 'pages'
export type VoucherPdfTextPosition = 'none' | 'below' | 'above'

export interface VoucherPdfSlot {
  /** template: 0-based template page index; pages: always 0. */
  page: number
  x: number
  y: number
  /** QR edge length incl. quiet zone (the box the code is drawn into). */
  size: number
  text: VoucherPdfTextPosition
  font_size: number
}

export interface VoucherPdfLayout {
  version: 1
  mode: VoucherPdfMode
  page_width: number
  page_height: number
  /** '#RRGGBB' — the dark modules. */
  qr_color: string
  /** '#RRGGBB'; null = transparent (no backing square). */
  background_color: string | null
  /** '#RRGGBB'; null = same as qr_color. */
  text_color: string | null
  /** Quiet zone around every code in modules; layouts saved before it existed get the default. */
  quiet_zone: number
  slots: VoucherPdfSlot[]
}

export const MAX_LAYOUT_SLOTS = 100
export const MAX_TEMPLATE_PAGES = 50
export const MAX_LAYOUT_BYTES = 64 * 1024
export const MIN_FONT_SIZE = 6
export const MAX_FONT_SIZE = 24
export const PT_PER_MM = 72 / 25.4
/** Quiet zone in modules: the QR standard's 4 by default, adjustable for designs with a calm surrounding. */
export const DEFAULT_QR_QUIET_ZONE = 4
export const MAX_QR_QUIET_ZONE = 10

/** Slots outside the page by up to this much (rounding of mm inputs) are still accepted. */
const PAGE_TOLERANCE = 0.5

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function optionalColor(value: unknown): string | null | undefined {
  if (value === null) return null
  return normalizeHexColor(value) ?? undefined
}

/** Validates and normalises a layout (colours upper-cased); returns an error string on failure. */
export function validateVoucherPdfLayout(input: unknown): { ok: true, layout: VoucherPdfLayout } | { ok: false, error: string } {
  const layout = input as Record<string, any> | null
  if (!layout || typeof layout !== 'object' || layout.version !== 1) return { ok: false, error: 'Ungültiges Layout' }
  if (layout.mode !== 'template' && layout.mode !== 'pages') return { ok: false, error: 'Ungültiger Layout-Modus' }
  if (!positiveNumber(layout.page_width) || !positiveNumber(layout.page_height)) return { ok: false, error: 'Ungültige Seitengröße' }

  const qrColor = typeof layout.qr_color === 'string' ? normalizeHexColor(layout.qr_color) : null
  const backgroundColor = optionalColor(layout.background_color)
  const textColor = optionalColor(layout.text_color)
  if (!qrColor || backgroundColor === undefined || textColor === undefined) return { ok: false, error: 'Ungültige Farbe im Layout' }

  const quietZone = layout.quiet_zone ?? DEFAULT_QR_QUIET_ZONE
  if (!Number.isInteger(quietZone) || quietZone < 0 || quietZone > MAX_QR_QUIET_ZONE) {
    return { ok: false, error: `Der Rand muss zwischen 0 und ${MAX_QR_QUIET_ZONE} Modulen liegen` }
  }

  if (!Array.isArray(layout.slots) || layout.slots.length < 1 || layout.slots.length > MAX_LAYOUT_SLOTS) {
    return { ok: false, error: `Das Layout braucht 1 bis ${MAX_LAYOUT_SLOTS} QR-Felder` }
  }

  const slots: VoucherPdfSlot[] = []
  for (const [index, slot] of (layout.slots as any[]).entries()) {
    const label = `QR-Feld ${index + 1}`
    if (!slot || typeof slot !== 'object') return { ok: false, error: `${label} ist ungültig` }
    if (!Number.isInteger(slot.page) || slot.page < 0 || slot.page >= MAX_TEMPLATE_PAGES) return { ok: false, error: `${label}: ungültige Seite` }
    if (layout.mode === 'pages' && slot.page !== 0) return { ok: false, error: `${label}: ungültige Seite` }
    if (!nonNegativeNumber(slot.x) || !nonNegativeNumber(slot.y) || !positiveNumber(slot.size)) return { ok: false, error: `${label}: ungültige Position` }
    if (slot.x + slot.size > layout.page_width + PAGE_TOLERANCE || slot.y + slot.size > layout.page_height + PAGE_TOLERANCE) {
      return { ok: false, error: `${label} liegt außerhalb der Seite` }
    }
    if (slot.text !== 'none' && slot.text !== 'below' && slot.text !== 'above') return { ok: false, error: `${label}: ungültige Textposition` }
    if (typeof slot.font_size !== 'number' || !(slot.font_size >= MIN_FONT_SIZE && slot.font_size <= MAX_FONT_SIZE)) {
      return { ok: false, error: `${label}: Schriftgröße muss zwischen ${MIN_FONT_SIZE} und ${MAX_FONT_SIZE} pt liegen` }
    }
    slots.push({ page: slot.page, x: slot.x, y: slot.y, size: slot.size, text: slot.text, font_size: slot.font_size })
  }

  return {
    ok: true,
    layout: {
      version: 1,
      mode: layout.mode,
      page_width: layout.page_width,
      page_height: layout.page_height,
      qr_color: qrColor,
      background_color: backgroundColor,
      text_color: textColor,
      quiet_zone: quietZone,
      slots,
    },
  }
}

/** Slots in fill order: template page by template page, in the order they were placed. */
export function slotsInFillOrder(layout: Pick<VoucherPdfLayout, 'slots'>): VoucherPdfSlot[] {
  return layout.slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.page - b.slot.page || a.index - b.index)
    .map(entry => entry.slot)
}
