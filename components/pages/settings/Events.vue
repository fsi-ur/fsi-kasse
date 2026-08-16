<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('events.allEvents')"
    :singular-label="t('events.eventName')"
    :add-label="t('events.newEvent')"
    :empty-label="t('events.none')"
    persist-key="settings-events"
    list-endpoint="/api/events"
    save-endpoint="/api/events/create"
    activate-endpoint="/api/events/activate"
    delete-endpoint="/api/events/delete"
    :delete-confirm-title="t('events.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('events.deleteConfirmQuestion', { name: item.name })"
    response-list-key="events"
    :extra-columns="columns"
    :editable="false"
    :read-only="readOnly"
    :read-only-notice="t('events.connectedNotice')"
    :create-item="() => ({ name: '', starts_at: '', ends_at: '' })"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'green' : 'gray'"
      />
    </template>

    <template #modal-fields="{ editingItem: entity }">
      <div class="flex gap-4">
        <div class="field flex-1">
          <label>{{ t('events.startsAt') }}</label>
          <CommonDateInput
            :model-value="toDateInputValue(entity.starts_at)"
            mode="datetime"
            @update:model-value="entity.starts_at = $event"
          />
        </div>
        <div class="field flex-1">
          <label>{{ t('events.endsAt') }}</label>
          <CommonDateInput
            :model-value="toDateInputValue(entity.ends_at)"
            mode="datetime"
            @update:model-value="entity.ends_at = $event"
          />
        </div>
      </div>
    </template>
  </PagesSettingsEntityManager>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import { useLocaleFormatters } from '~/composables/useLocaleFormatters'
import type { EntityManagerColumn } from './EntityManager.vue'

const { t } = useI18n()
const toast = useToast()
const { formatLocalDateTime } = useLocaleFormatters()

const managerRef = ref<{ loadItems: () => Promise<void> } | null>(null)
const readOnly = ref(false)

const columns: EntityManagerColumn[] = [
  {
    key: 'starts_at',
    label: t('events.startsAt'),
    filterType: 'date',
    getValue: item => (item as any).starts_at,
    format: item => formatLocalDateTime((item as any).starts_at),
  },
  {
    key: 'ends_at',
    label: t('events.endsAt'),
    filterType: 'date',
    getValue: item => (item as any).ends_at,
    format: item => formatLocalDateTime((item as any).ends_at),
  },
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

function toDateInputValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function handleError(context: { message?: string }) {
  toast.error(context.message || t('common.unknownError'))
}

useAppRefresh().onRefresh(async () => {
  await managerRef.value?.loadItems()
})

onMounted(async () => {
  const res = await $fetch('/api/events', { method: 'GET' })
  if (res.ok && 'read_only' in res) readOnly.value = Boolean(res.read_only)
})
</script>
