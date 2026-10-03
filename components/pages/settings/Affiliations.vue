<template>
  <PagesSettingsEntityManager
    ref="managerRef"
    :title="t('affiliations.all')"
    :singular-label="t('affiliations.singular')"
    :add-label="t('affiliations.new')"
    :empty-label="t('affiliations.none')"
    persist-key="settings-affiliations"
    list-endpoint="/api/affiliations"
    save-endpoint="/api/affiliations/create"
    update-endpoint="/api/affiliations/update"
    activate-endpoint="/api/affiliations/activate"
    response-list-key="affiliations"
    :extra-columns="columns"
    :create-item="() => ({ name: '' })"
    :map-edit-item="(item) => ({ id: item.id, name: item.name })"
    :on-error="handleError"
  >
    <template #cell-is_active="{ item }">
      <CommonStatusBadge
        :label="item.is_active ? t('common.active') : t('common.inactive')"
        :tone="item.is_active ? 'success' : 'baseMuted'"
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
</script>
