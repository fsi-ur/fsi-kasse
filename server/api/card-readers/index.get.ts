import { defineEventHandler, getQuery } from 'h3'
import { query } from '~/server/utils/db'
import { hasPermission, requirePermission } from '~/server/utils/api/guards'
import { canRemoveReader, firmwareAtLeast, listCardReaders, type CardReader } from '~/server/utils/cardReaders'
import { isCardConfigured, sumup, type SumupReaderStatus } from '~/server/utils/sumup'

// Tip prompts need firmware 3.3.38.0, the status call 3.3.39.0.
const MIN_FIRMWARE = '3.3.39.0'

// The paired terminals. Guest managers see the assignable ones (to pick a
// terminal for their own stands) plus the ones their association paired.
// `?status=1` refreshes pairings still in progress; admins also get each
// terminal's live status from SumUp.
export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.guest_manage')
  if (!current.ok) return current
  if (!isCardConfigured()) return { ok: true, configured: false, readers: [] }

  const canManage = hasPermission(current.user, 'cash_register.manage')
  let readers = await listCardReaders()
  if (!canManage) {
    readers = readers.filter(reader => (reader.is_active && reader.pairing_status === 'paired') || canRemoveReader(current.user, reader))
  }

  const withFlags = (reader: CardReader) => ({ ...reader, can_remove: canRemoveReader(current.user, reader) })

  if (getQuery(event).status !== '1') {
    return { ok: true, configured: true, readers: readers.map(reader => ({ ...withFlags(reader), live: null })) }
  }

  const client = sumup()
  const withStatus = await Promise.all(readers.map(async (reader) => {
    if (reader.pairing_status === 'processing') {
      const fetched = await client.getReader(reader.sumup_reader_id)
      if (fetched.ok && fetched.reader.status !== reader.pairing_status) {
        await query(
          `UPDATE card_readers SET pairing_status = ?, device_serial = COALESCE(?, device_serial), device_model = COALESCE(?, device_model) WHERE id = ?`,
          [fetched.reader.status, fetched.reader.serial, fetched.reader.model, reader.id],
        )
        reader = { ...reader, pairing_status: fetched.reader.status }
      }
    }

    let live: (SumupReaderStatus & { firmware_ok: boolean | null }) | null = null
    let liveError: string | null = null
    if (canManage && reader.pairing_status === 'paired') {
      const status = await client.getReaderStatus(reader.sumup_reader_id)
      if (status.ok) live = { ...status.status, firmware_ok: firmwareAtLeast(status.status.firmware_version, MIN_FIRMWARE) }
      else liveError = status.error
    }
    return { ...withFlags(reader), live, live_error: liveError }
  }))

  return { ok: true, configured: true, readers: withStatus }
})
