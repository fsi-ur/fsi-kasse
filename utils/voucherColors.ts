// Colour helpers for QR exports and the PDF stamper. Plain functions without
// browser APIs, so server-side validation and client-side warnings agree.

export interface RgbColor { r: number, g: number, b: number }

const HEX_PATTERN = /^#?([0-9A-Fa-f]{6})$/

/** '#RRGGBB' in upper case, or null when the value is not a 6-digit hex colour. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(HEX_PATTERN)
  return match ? `#${match[1]!.toUpperCase()}` : null
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex) ?? '#000000'
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function channel(value: number) {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance(color: string | RgbColor): number {
  const { r, g, b } = typeof color === 'string' ? hexToRgb(color) : color
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 … 21. */
export function contrastRatio(a: string | RgbColor, b: string | RgbColor): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** True when the QR modules are lighter than their background — many phone scanners can't read that. */
export function isInverted(qrColor: string | RgbColor, backgroundColor: string | RgbColor): boolean {
  return relativeLuminance(qrColor) > relativeLuminance(backgroundColor)
}

/** Below this contrast a QR code gets unreliable to scan. */
export const MIN_QR_CONTRAST = 4
