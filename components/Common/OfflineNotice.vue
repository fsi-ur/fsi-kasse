<template>
  <div
    class="col-span-12 flex items-start gap-3 rounded-xl border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-900"
    role="status"
  >
    <Icon name="material-symbols:cloud-off-outline-rounded" class="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div class="space-y-0.5">
      <p class="font-semibold">{{ title }}</p>
      <p v-if="text">{{ text }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'

// stale:       offline, showing the last loaded data from `cachedAt`
// noData:      offline, and this device never loaded this view before
// unavailable: the view needs the server (settings, admin actions)
const props = withDefaults(defineProps<{
  variant?: 'stale' | 'noData' | 'unavailable'
  cachedAt?: number | null
}>(), {
  variant: 'stale',
  cachedAt: null,
})

const { t } = useI18n()
const { formatDateTime } = useLocaleFormatters()

const title = computed(() => {
  if (props.variant === 'stale' && props.cachedAt) {
    return t('offline.staleSince', { time: formatDateTime(new Date(props.cachedAt).toISOString()) })
  }
  if (props.variant === 'unavailable') return t('offline.unavailableTitle')
  return t('offline.noDataTitle')
})

const text = computed(() => {
  if (props.variant === 'unavailable') return t('offline.unavailableText')
  if (props.variant === 'noData' || !props.cachedAt) return t('offline.noDataText')
  return ''
})
</script>
