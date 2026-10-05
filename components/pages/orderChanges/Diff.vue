<template>
  <div class="space-y-3">
    <p v-if="isCancellation" class="rounded-lg bg-danger-50 px-3 py-2 text-sm font-semibold text-danger-900">
      {{ t('orderChanges.cancellation') }}
    </p>

    <ul>
      <li
        v-for="row in rows"
        :key="row.key"
        class="grid grid-cols-6 items-center gap-2 py-2 border-b border-base-200"
      >
        <span class="col-span-2 text-sm">
          <template v-if="row.kind === 'changed'">
            <span class="text-base-500 line-through">{{ row.before }}</span> → <span class="font-semibold">{{ row.after }}</span>
          </template>
          <template v-else-if="row.kind === 'removed'">
            <span class="text-danger-700 line-through">{{ row.before }}</span> → 0
          </template>
          <span v-else-if="row.kind === 'added'" class="font-semibold text-success-700">+{{ row.after }}</span>
          <span v-else>{{ row.after }}</span>
        </span>
        <span class="col-span-3" :class="{ 'line-through text-base-500': row.kind === 'removed' }">
          {{ row.name }}
          <span class="text-xs text-base-500">
            {{ formatCurrency(row.price) }}<template v-if="row.deposit > 0"> {{ t('checkout.depositSuffix', { amount: formatCurrency(row.deposit) }) }}</template>
          </span>
          <span v-if="row.voucherCode" class="mt-0.5 flex items-center gap-1">
            <span class="rounded-full bg-success-300 px-2 py-0.5 text-[10px] font-medium text-success-900">
              {{ row.lineKind === 'voucher_sale' ? t('vouchers.cart.sold') : t('vouchers.cart.badge') }}
            </span>
            <span class="font-mono text-xs text-base-500">{{ formatVoucherCode(row.voucherCode) }}</span>
          </span>
        </span>
        <span class="col-span-1 flex justify-end">
          <CommonStatusBadge v-if="row.kind === 'added'" :label="t('orderChanges.added')" tone="success" />
          <CommonStatusBadge v-else-if="row.kind === 'removed'" :label="t('orderChanges.removed')" tone="danger" />
        </span>
      </li>
    </ul>

    <div v-if="request.original.fachschaft !== request.proposed.fachschaft" class="flex justify-between text-sm">
      <span>{{ t('history.fachschaftBadge') }}</span>
      <span>
        <span class="text-base-500 line-through">{{ request.original.fachschaft ? t('common.yes') : t('common.no') }}</span>
        → <span class="font-semibold">{{ request.proposed.fachschaft ? t('common.yes') : t('common.no') }}</span>
      </span>
    </div>

    <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      <dt class="text-base-500">{{ t('orderChanges.before') }}</dt>
      <dd class="text-right">{{ formatCurrency(request.original.total) }}</dd>
      <dt class="text-base-500">{{ t('orderChanges.after') }}</dt>
      <dd class="text-right">{{ formatCurrency(request.proposed.total) }}</dd>
      <dt class="font-semibold">{{ t('orderChanges.difference') }}</dt>
      <dd class="text-right font-semibold" :class="difference < 0 ? 'text-danger-700' : difference > 0 ? 'text-success-700' : ''">
        {{ difference > 0 ? '+' : '' }}{{ formatCurrency(difference) }}
      </dd>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { OrderChangeRequest } from '~/server/utils/orderChanges'
import { formatVoucherCode } from '~/utils/voucherCode'

const props = defineProps<{
  request: Pick<OrderChangeRequest, 'original' | 'proposed'>
}>()

const { t } = useI18n()
const { formatCurrency } = useLocaleFormatters()

interface DiffRow {
  key: string
  kind: 'unchanged' | 'changed' | 'removed' | 'added'
  name: string
  price: number
  deposit: number
  before: number
  after: number
  lineKind: string
  voucherCode: string | null
}

const rows = computed<DiffRow[]>(() => {
  const proposedByOrderItem = new Map(props.request.proposed.lines
    .filter(line => line.order_item_id != null)
    .map(line => [line.order_item_id, line]))

  const result: DiffRow[] = props.request.original.lines.map((line) => {
    const proposed = proposedByOrderItem.get(line.order_item_id)
    const after = proposed?.quantity ?? 0
    return {
      key: `original-${line.id}`,
      kind: !proposed ? 'removed' : after !== line.quantity ? 'changed' : 'unchanged',
      name: line.name,
      price: line.price,
      deposit: line.deposit,
      before: line.quantity,
      after,
      lineKind: line.line_kind,
      voucherCode: line.voucher_code,
    }
  })

  for (const line of props.request.proposed.lines) {
    if (line.order_item_id != null) continue
    result.push({
      key: `added-${line.id}`,
      kind: 'added',
      name: line.name,
      price: line.price,
      deposit: line.deposit,
      before: 0,
      after: line.quantity,
      lineKind: line.line_kind,
      voucherCode: line.voucher_code,
    })
  }

  return result
})

const isCancellation = computed(() => props.request.proposed.lines.length === 0)
const difference = computed(() => Math.round((props.request.proposed.total - props.request.original.total) * 100) / 100)
</script>
