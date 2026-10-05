import { useI18n } from '~/composables/useI18n'

export type VoucherDisplayStatus = 'unsold' | 'active' | 'used_up' | 'revoked'
type BadgeTone = 'base' | 'warning' | 'success' | 'dangerCancelled' | 'danger' | 'baseMuted'

const STATUS_KEYS: Record<VoucherDisplayStatus, string> = {
  unsold: 'vouchers.status.unsold',
  active: 'vouchers.status.active',
  used_up: 'vouchers.status.usedUp',
  revoked: 'vouchers.status.revoked',
}

const STATUS_TONES: Record<VoucherDisplayStatus, BadgeTone> = {
  unsold: 'base',
  active: 'success',
  used_up: 'baseMuted',
  revoked: 'danger',
}

export function useExportStatusOptions() {
  const { t } = useI18n()
  return computed(() => [
    { value: '', label: t('vouchers.export.selectionDefault') },
    { value: 'unsold', label: t('vouchers.export.selectionUnsold') },
    { value: 'active', label: t('vouchers.export.selectionActive') },
    { value: 'all', label: t('vouchers.export.selectionAll') },
  ])
}

export function useVoucherLabels() {
  const { t } = useI18n()

  return {
    statusLabel: (status: VoucherDisplayStatus) => t(STATUS_KEYS[status] ?? status),
    statusTone: (status: VoucherDisplayStatus): BadgeTone => STATUS_TONES[status] ?? 'baseMuted',
    kindLabel: (kind: 'paid' | 'free') => t(kind === 'paid' ? 'vouchers.kind.paid' : 'vouchers.kind.free'),
  }
}
