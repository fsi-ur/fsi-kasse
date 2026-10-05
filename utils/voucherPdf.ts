import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import { hexToRgb } from '~/utils/voucherColors'
import { formatVoucherCode } from '~/utils/voucherCode'
import { slotsInFillOrder, type VoucherPdfLayout, type VoucherPdfSlot } from '~/utils/voucherPdfLayout'

// Stamps QR codes onto a PDF designed elsewhere. Runs entirely in the browser:
// the PDF never leaves the device. pdf-lib and qrcode are loaded on demand so
// they stay out of the main bundle.

const YIELD_EVERY_PAGES = 25
/** Page sizes may differ by this much (pt) and still count as equal. */
const SIZE_TOLERANCE = 1

export type VoucherPdfErrorCode = 'encrypted' | 'invalid' | 'rotated' | 'pageSize' | 'tooFewPages' | 'templatePages' | 'noCodes'

export class VoucherPdfError extends Error {
  constructor(public code: VoucherPdfErrorCode, public params: Record<string, string | number> = {}) {
    super(code)
  }
}

export interface VoucherPdfPlan {
  /** Pages of the generated PDF. */
  pages: number
  /** Slots that get no voucher (end of the last sheet / unused pages). */
  emptySlots: number
}

export interface Box { x: number, y: number, width: number, height: number }

async function loadLibraries() {
  const [pdfLib, qrcode] = await Promise.all([import('pdf-lib'), import('qrcode')])
  return { pdfLib, QRCode: (qrcode as any).default ?? qrcode }
}

export async function loadSourcePdf(bytes: ArrayBuffer): Promise<PDFDocument> {
  const { pdfLib } = await loadLibraries()
  try {
    return await pdfLib.PDFDocument.load(bytes)
  } catch (error) {
    if (error instanceof pdfLib.EncryptedPDFError || /is encrypted/i.test(String((error as Error)?.message))) {
      throw new VoucherPdfError('encrypted')
    }
    throw new VoucherPdfError('invalid')
  }
}

export function cropBoxOf(page: PDFPage): Box {
  return page.getCropBox()
}

export function assertNotRotated(page: PDFPage, index: number) {
  if (page.getRotation().angle % 360 !== 0) throw new VoucherPdfError('rotated', { page: index + 1 })
}

/** How many pages the output gets and how many slots stay empty, without generating anything. */
export function planVoucherPdf(layout: VoucherPdfLayout, sourcePages: number, codes: number): VoucherPdfPlan {
  const slotCount = layout.slots.length
  if (layout.mode === 'template') {
    const sheets = Math.max(1, Math.ceil(codes / slotCount))
    return { pages: sheets * sourcePages, emptySlots: sheets * slotCount - codes }
  }
  return { pages: sourcePages, emptySlots: Math.max(0, sourcePages * slotCount - codes) }
}

/** Checks the source PDF's page boxes against the layout; throws a VoucherPdfError when it can't be stamped. */
export function validateSourceBoxes(pages: Box[], layout: VoucherPdfLayout, codes: number) {
  if (layout.mode === 'template') {
    const highest = Math.max(...layout.slots.map(slot => slot.page))
    if (highest >= pages.length) throw new VoucherPdfError('templatePages', { pages: pages.length, needed: highest + 1 })
    return
  }

  const reference = pages[0]!
  pages.forEach((box, index) => {
    if (Math.abs(box.width - reference.width) > SIZE_TOLERANCE || Math.abs(box.height - reference.height) > SIZE_TOLERANCE) {
      throw new VoucherPdfError('pageSize', { page: index + 1 })
    }
  })
  if (codes > pages.length * layout.slots.length) {
    throw new VoucherPdfError('tooFewPages', { pages: pages.length, needed: Math.ceil(codes / layout.slots.length) })
  }
}

interface DrawContext {
  QRCode: any
  pdfLib: typeof import('pdf-lib')
  font: PDFFont
  layout: VoucherPdfLayout
}

/** Draws one QR code as vectors (backing square + merged horizontal runs) plus the optional code text. */
function drawVoucher(page: PDFPage, box: Box, slot: VoucherPdfSlot, code: string, ctx: DrawContext) {
  const { rgb } = ctx.pdfLib
  const toColor = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    return rgb(r / 255, g / 255, b / 255)
  }

  const modules = ctx.QRCode.create(code, { errorCorrectionLevel: 'M' }).modules
  const count: number = modules.size
  const quietZone = ctx.layout.quiet_zone
  const moduleSize = slot.size / (count + quietZone * 2)
  const left = box.x + slot.x
  const top = box.y + box.height - slot.y

  if (ctx.layout.background_color) {
    page.drawRectangle({ x: left, y: top - slot.size, width: slot.size, height: slot.size, color: toColor(ctx.layout.background_color) })
  }

  const dark = toColor(ctx.layout.qr_color)
  for (let row = 0; row < count; row += 1) {
    let col = 0
    while (col < count) {
      if (!modules.get(row, col)) {
        col += 1
        continue
      }
      const start = col
      while (col < count && modules.get(row, col)) col += 1
      page.drawRectangle({
        x: left + (quietZone + start) * moduleSize,
        y: top - (quietZone + row + 1) * moduleSize,
        width: (col - start) * moduleSize,
        // A hair of overlap so viewers don't show seams between rows.
        height: moduleSize + 0.01,
        color: dark,
      })
    }
  }

  if (slot.text === 'none') return
  const text = formatVoucherCode(code)
  const width = ctx.font.widthOfTextAtSize(text, slot.font_size)
  const gap = slot.font_size * 0.3
  page.drawText(text, {
    x: left + (slot.size - width) / 2,
    y: slot.text === 'below'
      ? top - slot.size - gap - ctx.font.heightAtSize(slot.font_size, { descender: false })
      : top + gap,
    size: slot.font_size,
    font: ctx.font,
    color: toColor(ctx.layout.text_color ?? ctx.layout.qr_color),
  })
}

function yieldToUi() {
  return new Promise(resolve => setTimeout(resolve))
}

/**
 * Generates the stamped PDF. `codes` are in CSV order. Template mode repeats
 * the design as often as needed (embedding it only once); pages mode draws onto
 * the existing pages in place.
 */
export async function generateVoucherPdf(options: {
  source: ArrayBuffer
  layout: VoucherPdfLayout
  codes: string[]
  onProgress?: (done: number, total: number) => void
  /** Only the first sheet (template) or page (pages mode), with real codes — for a test print. */
  testPageOnly?: boolean
}): Promise<Uint8Array> {
  const { layout, codes, onProgress, testPageOnly = false } = options
  if (!codes.length) throw new VoucherPdfError('noCodes')

  const { pdfLib, QRCode } = await loadLibraries()
  const source = await loadSourcePdf(options.source)
  source.getPages().forEach(assertNotRotated)
  validateSourceBoxes(source.getPages().map(cropBoxOf), layout, codes.length)

  const slots = slotsInFillOrder(layout)
  const sourcePages = source.getPages()
  const plan = testPageOnly
    ? { pages: layout.mode === 'template' ? sourcePages.length : 1, emptySlots: 0 }
    : planVoucherPdf(layout, sourcePages.length, codes.length)

  if (layout.mode === 'pages') {
    const font = await source.embedFont(pdfLib.StandardFonts.Helvetica)
    const ctx: DrawContext = { QRCode, pdfLib, font, layout }
    if (testPageOnly) {
      for (let index = sourcePages.length - 1; index >= 1; index -= 1) source.removePage(index)
    }
    for (const [pageIndex, page] of sourcePages.slice(0, plan.pages).entries()) {
      const box = cropBoxOf(page)
      slots.forEach((slot, slotIndex) => {
        const code = codes[pageIndex * slots.length + slotIndex]
        if (code) drawVoucher(page, box, slot, code, ctx)
      })
      if ((pageIndex + 1) % YIELD_EVERY_PAGES === 0) {
        onProgress?.(pageIndex + 1, plan.pages)
        await yieldToUi()
      }
    }
    onProgress?.(plan.pages, plan.pages)
    return source.save()
  }

  const out = await pdfLib.PDFDocument.create()
  const font = await out.embedFont(pdfLib.StandardFonts.Helvetica)
  const ctx: DrawContext = { QRCode, pdfLib, font, layout }
  const boxes = sourcePages.map(cropBoxOf)
  // Embedded once as form XObjects, so thousands of vouchers stay a small file.
  const designs = await out.embedPages(sourcePages, boxes.map(box => ({
    left: box.x,
    bottom: box.y,
    right: box.x + box.width,
    top: box.y + box.height,
  })))

  const sheets = plan.pages / sourcePages.length
  let codeIndex = 0
  let done = 0
  for (let sheet = 0; sheet < sheets; sheet += 1) {
    for (const [templateIndex, design] of designs.entries()) {
      const { width, height } = boxes[templateIndex]!
      const page = out.addPage([width, height])
      page.drawPage(design, { x: 0, y: 0, width, height })
      const pageBox = { x: 0, y: 0, width, height }
      for (const slot of slots) {
        if (slot.page !== templateIndex) continue
        const code = codes[codeIndex]
        codeIndex += 1
        if (code) drawVoucher(page, pageBox, slot, code, ctx)
      }
      done += 1
      if (done % YIELD_EVERY_PAGES === 0) {
        onProgress?.(done, plan.pages)
        await yieldToUi()
      }
    }
  }
  onProgress?.(plan.pages, plan.pages)
  return out.save()
}
