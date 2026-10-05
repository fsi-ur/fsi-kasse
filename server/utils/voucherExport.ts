import { deflateSync } from 'node:zlib'
import { strToU8, zipSync, type Zippable } from 'fflate'
import QRCode from 'qrcode'
import { formatVoucherCode } from '~/utils/voucherCode'
import { hexToRgb } from '~/utils/voucherColors'
import { DEFAULT_QR_QUIET_ZONE, MAX_QR_QUIET_ZONE } from '~/utils/voucherPdfLayout'
import type { VoucherBatchRow } from '~/server/utils/vouchers'

const CSV_HEADER = ['code', 'code_formatted', 'batch', 'kind', 'item_group', 'units', 'includes_deposit', 'price', 'event', 'valid_until', 'qr_svg', 'qr_png']

/** QR settings shared by every export: error correction M, 4-module quiet zone unless chosen otherwise. */
export const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: DEFAULT_QR_QUIET_ZONE }

/** Quiet zone in whole modules from a query value; missing ⇒ the default, invalid ⇒ null. */
export function parseQrMargin(value: unknown) {
  if (value === undefined || value === '') return QR_OPTIONS.margin
  const margin = Number(value)
  return Number.isInteger(margin) && margin >= 0 && margin <= MAX_QR_QUIET_ZONE ? margin : null
}
const PNG_WIDTH = 1024

function csvField(value: unknown) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * One row per voucher, for data merge in a design tool. Values are plain
 * (12.50, ISO dates) — formatting is the design tool's job. UTF-8 with BOM so
 * Excel reads umlauts correctly.
 */
export function buildVoucherCsv(batch: VoucherBatchRow, vouchers: Array<{ code: string }>) {
  const lines = [CSV_HEADER.join(',')]
  for (const voucher of vouchers) {
    lines.push([
      voucher.code,
      formatVoucherCode(voucher.code),
      batch.name,
      batch.kind,
      batch.item_group_name,
      batch.units_per_voucher,
      batch.includes_deposit ? 1 : 0,
      batch.sale_price == null ? '' : batch.sale_price.toFixed(2),
      batch.event_name ?? '',
      batch.valid_until ? batch.valid_until.slice(0, 10) : '',
      `qr/${voucher.code}.svg`,
      `qr/${voucher.code}.png`,
    ].map(csvField).join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** `background` null = transparent: the light modules and the quiet zone get alpha 0. */
export async function buildVoucherZip(
  batch: VoucherBatchRow,
  vouchers: Array<{ code: string }>,
  colors: { qr: string, background: string | null },
  margin: number = QR_OPTIONS.margin,
) {
  const color = {
    dark: `${colors.qr}FF`,
    light: colors.background ? `${colors.background}FF` : '#00000000',
  }

  const files: Zippable = {
    'vouchers.csv': strToU8(buildVoucherCsv(batch, vouchers)),
  }

  for (const voucher of vouchers) {
    // With a fully transparent light colour qrcode leaves out the background path entirely.
    const svg = await QRCode.toString(voucher.code, { ...QR_OPTIONS, margin, type: 'svg', color })

    files[`qr/${voucher.code}.svg`] = strToU8(svg)
    // PNGs are already deflated; storing them saves time without growing the file.
    files[`qr/${voucher.code}.png`] = [renderQrPng(voucher.code, colors, margin), { level: 0 }]
  }

  return zipSync(files, { level: 6 })
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 'ascii')
  chunk.set(data, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length)
  return chunk
}

/**
 * A QR code as a PNG_WIDTH² PNG. QR codes have exactly two colours, so this
 * writes an indexed PNG (palette + tRNS for transparency) directly — about
 * 30× faster than qrcode's generic RGBA encoder.
 */
export function renderQrPng(code: string, colors: { qr: string, background: string | null }, margin: number = QR_OPTIONS.margin) {
  const qr = QRCode.create(code, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel })
  const modules = qr.modules.size
  const total = modules + margin * 2

  // Which module (incl. quiet zone) every pixel column/row falls into.
  const moduleAt = new Int16Array(PNG_WIDTH)
  for (let pixel = 0; pixel < PNG_WIDTH; pixel += 1) {
    moduleAt[pixel] = Math.floor(pixel * total / PNG_WIDTH) - margin
  }

  const stride = PNG_WIDTH + 1
  const raw = Buffer.alloc(stride * PNG_WIDTH)
  for (let y = 0; y < PNG_WIDTH; y += 1) {
    const row = y * stride
    const moduleRow = moduleAt[y]!
    // Filter byte 0, then palette indices: 0 = background, 1 = QR module.
    if (y > 0 && moduleAt[y - 1] === moduleRow) {
      raw.copy(raw, row, row - stride, row)
      continue
    }
    if (moduleRow < 0 || moduleRow >= modules) continue
    for (let x = 0; x < PNG_WIDTH; x += 1) {
      const moduleCol = moduleAt[x]!
      if (moduleCol >= 0 && moduleCol < modules && qr.modules.get(moduleRow, moduleCol)) raw[row + 1 + x] = 1
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(PNG_WIDTH, 0)
  header.writeUInt32BE(PNG_WIDTH, 4)
  header[8] = 8 // bit depth
  header[9] = 3 // indexed colour

  const light = hexToRgb(colors.background ?? '#FFFFFF')
  const dark = hexToRgb(colors.qr)
  const palette = Uint8Array.from([light.r, light.g, light.b, dark.r, dark.g, dark.b])
  const alpha = Uint8Array.from([colors.background ? 255 : 0, 255])

  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', header),
    pngChunk('PLTE', palette),
    pngChunk('tRNS', alpha),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]))
}
