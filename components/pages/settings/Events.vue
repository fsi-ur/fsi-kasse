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
    :create-item="() => ({ name: '' })"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'green' : 'gray'"
      />
    </template>
  </PagesSettingsEntityManager>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { useToast } from '~/composables/useToast'
import type { EntityManagerColumn } from './EntityManager.vue'

const { t } = useI18n()
const toast = useToast()

const managerRef = ref<{ loadItems: () => Promise<void> } | null>(null)
const readOnly = ref(false)

const columns: EntityManagerColumn[] = [
  {
    key: 'is_active',
    label: t('common.active'),
    filterable: false,
    sortable: false,
    getValue: item => item.is_active ? t('common.active') : t('common.inactive'),
  },
]

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
