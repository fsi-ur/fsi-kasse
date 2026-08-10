<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('cashiers.allCashiers')"
    :singular-label="t('cashiers.cashierName')"
    :add-label="t('cashiers.newCashier')"
    :empty-label="t('cashiers.none')"
    persist-key="settings-cashiers"
    list-endpoint="/api/cashiers"
    save-endpoint="/api/cashiers/create"
    activate-endpoint="/api/cashiers/activate"
    delete-endpoint="/api/cashiers/delete"
    :delete-confirm-title="t('cashiers.deleteConfirmTitle')"
    :delete-confirm-question="(item) => t('cashiers.deleteConfirmQuestion', { name: item.name })"
    response-list-key="cashiers"
    :extra-columns="columns"
    :editable="false"
    :read-only="readOnly"
    :read-only-notice="t('cashiers.connectedNotice')"
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
  const res = await $fetch('/api/cashiers', { method: 'GET' })
  if (res.ok && 'read_only' in res) readOnly.value = Boolean(res.read_only)
})
</script>
