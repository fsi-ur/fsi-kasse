<template>
  <div class="space-y-3 rounded-xl border border-base-200 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-mono text-lg font-semibold">{{ voucher.code_formatted }}</span>
      <CommonStatusBadge :label="statusLabel(voucher.display_status)" :tone="statusTone(voucher.display_status)" />
      <CommonStatusBadge :label="kindLabel(voucher.batch.kind)" :tone="voucher.batch.kind === 'paid' ? 'warning' : 'success'" />
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-base-500">{{ t('vouchers.list.batch') }}</dt>
      <dd class="text-right">{{ voucher.batch.name }}</dd>
      <dt class="text-base-500">{{ t('vouchers.form.itemGroup') }}</dt>
      <dd class="text-right">{{ voucher.batch.item_group_name }}</dd>
      <dt class="text-base-500">{{ t('vouchers.list.units') }}</dt>
      <dd class="text-right font-semibold">{{ t('vouchers.card.unitsLeft', { remaining: voucher.units_remaining, total: voucher.units_total }) }}</dd>
      <dt class="text-base-500">{{ t('common.deposit') }}</dt>
      <dd class="text-right">{{ voucher.batch.includes_deposit ? t('vouchers.card.depositIncluded') : t('vouchers.card.depositExtra') }}</dd>
      <template v-if="voucher.batch.kind === 'paid'">
        <dt class="text-base-500">{{ t('common.price') }}</dt>
        <dd class="text-right">{{ formatCurrency(voucher.batch.sale_price) }}</dd>
      </template>
      <dt class="text-base-500">{{ t('vouchers.form.event') }}</dt>
      <dd class="text-right">{{ voucher.batch.event_name ?? t('vouchers.form.anyEvent') }}</dd>
      <dt class="text-base-500">{{ t('vouchers.form.validUntil') }}</dt>
      <dd class="text-right">{{ voucher.batch.valid_until ? formatLocalDate(voucher.batch.valid_until) : t('vouchers.form.noExpiry') }}</dd>
      <template v-if="voucher.sold_at">
        <dt class="text-base-500">{{ t('vouchers.list.soldAt') }}</dt>
        <dd class="text-right">{{ formatDateTime(voucher.sold_at) }}<template v-if="voucher.sold_order_id"> · #{{ voucher.sold_order_id }}</template></dd>
      </template>
    </dl>

    <p v-if="voucher.status === 'revoked'" class="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-900">
      {{ t('vouchers.card.revokedInfo', { date: formatDateTime(voucher.revoked_at), name: voucher.revoked_by ?? '' }) }}
      <span v-if="voucher.revoke_reason" class="block">{{ voucher.revoke_reason }}</span>
    </p>

    <div v-if="voucher.redemptions?.length">
      <h4 class="section-title">{{ t('vouchers.card.redemptions') }}</h4>
      <ul class="max-h-40 overflow-y-auto text-xs text-base-700">
        <li
          v-for="(entry, index) in voucher.redemptions"
          :key="`${entry.order_id}-${index}`"
          class="flex justify-between gap-2 border-b border-base-100 py-1 last:border-b-0"
        >
          <span>{{ formatDateTime(entry.created_at) }}<template v-if="entry.event_name"> · {{ entry.event_name }}</template></span>
          <span>{{ entry.quantity }}× {{ entry.item_name }} · #{{ entry.order_id }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useVoucherLabels } from '~/composables/useVoucherLabels'

defineProps<{
  /** `voucher` of /api/vouchers/lookup. */
  voucher: any
}>()

const { t } = useI18n()
const { formatCurrency, formatDateTime, formatLocalDate } = useLocaleFormatters()
const { statusLabel, statusTone, kindLabel } = useVoucherLabels()
</script>
