<template>
  <CommonModal
    :model-value="modelValue"
    :title="t('offline.queueTitle')"
    width-class="max-w-2xl"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p v-if="!isOnline" class="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-900">
      <Icon name="material-symbols:cloud-off-outline-rounded" class="h-5 w-5 shrink-0" aria-hidden="true" />
      {{ t('offline.offlineHint') }}
    </p>

    <div v-if="sortedEntries.length === 0" class="text-sm text-base-500">
      {{ t('offline.queueEmpty') }}
    </div>

    <ul v-else class="divide-y divide-base-200">
      <li v-for="entry in sortedEntries" :key="entry.client_uuid" class="flex flex-col gap-2 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">
            {{ entry.kind === 'checkout' ? t('offline.kindCheckout') : t('offline.kindFachschaft') }}
          </span>
          <CommonStatusBadge
            :label="entry.status === 'failed' ? t('offline.statusFailed') : t('offline.statusPending')"
            :tone="entry.status === 'failed' ? 'danger' : 'warning'"
          />
          <span class="ml-auto font-semibold">{{ formatCurrency(entry.display.localTotal) }}</span>
        </div>

        <div class="text-sm text-base-700">{{ entry.display.summary }}</div>

        <div class="text-xs text-base-500">
          {{ entry.display.cashierName }} · {{ entry.display.eventName }} ·
          <template v-if="entry.display.standName">{{ entry.display.standName }} ·</template>
          {{ t('offline.queuedAt', { time: formatDateTime(new Date(entry.queued_at).toISOString()) }) }}
        </div>

        <template v-if="entry.status === 'failed'">
          <div class="text-sm text-danger-600">
            {{ t('offline.lastError', { error: entry.last_error ?? t('common.unknownError') }) }}
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="discardTarget = entry.client_uuid">
              {{ t('offline.discard') }}
            </button>
            <button type="button" class="btn-primary" :disabled="isFlushing" @click="retry(entry.client_uuid)">
              {{ t('offline.retry') }}
            </button>
          </div>
        </template>
      </li>
    </ul>

    <template #footer>
      <button type="button" class="btn-secondary" @click="$emit('update:modelValue', false)">
        {{ t('actions.close') }}
      </button>
      <button
        v-if="pendingCount > 0"
        type="button"
        class="btn-primary flex items-center gap-2"
        :disabled="isFlushing"
        @click="flush()"
      >
        <Icon
          v-if="isFlushing"
          name="material-symbols:progress-activity"
          class="h-4 w-4 animate-spin"
          aria-hidden="true"
        />
        {{ t('offline.syncNow') }}
      </button>
    </template>
  </CommonModal>

  <FormConfirmation
    v-if="discardTarget"
    :headline="t('offline.discardTitle')"
    @confirm="confirmDiscard"
    @cancel="discardTarget = null"
  >
    <template #message>
      {{ t('offline.discardConfirm') }}
    </template>
  </FormConfirmation>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import { useConnectivity } from '~/composables/useConnectivity'
import { useOfflineQueue } from '~/composables/useOfflineQueue'

defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const { formatCurrency, formatDateTime } = useLocaleFormatters()
const { isOnline } = useConnectivity()
const { entries, pendingCount, isFlushing, flush, retry, discard } = useOfflineQueue()

const discardTarget = ref<string | null>(null)

// Failed entries first — they are the ones that need a decision.
const sortedEntries = computed(() => [...entries.value].sort((a, b) => {
  if (a.status !== b.status) return a.status === 'failed' ? -1 : 1
  return a.queued_at - b.queued_at
}))

async function confirmDiscard() {
  const target = discardTarget.value
  discardTarget.value = null
  if (target) await discard(target)
}
</script>
