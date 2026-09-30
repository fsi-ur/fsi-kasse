<template>
  <button
    v-if="!isOnline || pendingCount > 0 || failedCount > 0"
    type="button"
    class="flex flex-wrap items-center gap-2 cursor-pointer"
    :aria-label="t('offline.queueTitle')"
    @click="showQueue = true"
  >
    <span v-if="!isOnline" class="flex items-center gap-1 rounded-full bg-warning-300 px-3 py-1 text-xs font-medium text-warning-900">
      <Icon name="material-symbols:cloud-off-outline-rounded" class="h-4 w-4" aria-hidden="true" />
      {{ t('offline.offline') }}
    </span>

    <span v-if="pendingCount > 0" class="flex items-center gap-1 rounded-full bg-warning-100 px-3 py-1 text-xs font-medium text-warning-900">
      <Icon
        :name="isFlushing ? 'material-symbols:progress-activity' : 'material-symbols:cloud-sync-outline-rounded'"
        :class="['h-4 w-4', isFlushing ? 'animate-spin' : '']"
        aria-hidden="true"
      />
      {{ t('offline.pending', { count: pendingCount }) }}
    </span>

    <span v-if="failedCount > 0" class="flex items-center gap-1 rounded-full bg-danger-300 px-3 py-1 text-xs font-medium text-danger-900">
      <Icon name="material-symbols:error-outline-rounded" class="h-4 w-4" aria-hidden="true" />
      {{ t('offline.failed', { count: failedCount }) }}
    </span>
  </button>

  <OfflineQueueModal v-model="showQueue" />
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useConnectivity } from '~/composables/useConnectivity'
import { useOfflineQueue } from '~/composables/useOfflineQueue'

const { t } = useI18n()
const { isOnline } = useConnectivity()
const { pendingCount, failedCount, isFlushing } = useOfflineQueue()

const showQueue = ref(false)
</script>
