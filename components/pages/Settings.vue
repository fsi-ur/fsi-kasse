<template>
  <Page :headline1="t('settings.title')" flush-header-with-cards @open-menu="$emit('openMenu')">
    <template #header="{ headerContainerRef, headlineGroupRef }">
      <CommonTabOverview
        v-model="currentTab"
        :tabs="tabs"
        :header-container-ref="headerContainerRef"
        :headline-group-ref="headlineGroupRef"
      />
    </template>

    <template #cards>
      <component :is="activeComponent" />
    </template>
  </Page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { usePage } from '~/composables/usePage'
import SettingsGeneral from './settings/General.vue'
import SettingsCashRegister from './settings/CashRegister.vue'
import SettingsItems from './settings/Items.vue'
import SettingsCashiers from './settings/Cashiers.vue'
import SettingsEvents from './settings/Events.vue'
import SettingsUsers from './settings/Users.vue'

defineEmits<{
  (e: 'openMenu'): void
}>()

type SettingsTab = 'general' | 'cashRegister' | 'items' | 'cashiers' | 'events' | 'users'

const currentTab = useState<SettingsTab>('settings-overview-current-tab', () => 'general')
const { t } = useI18n()
const { pageMeta, setPage } = usePage()

const tabs = computed(() => [
  { key: 'general', label: t('settings.tabs.general') },
  { key: 'cashRegister', label: t('settings.tabs.cashRegister') },
  { key: 'items', label: t('settings.tabs.items') },
  { key: 'cashiers', label: t('settings.tabs.cashiers') },
  { key: 'events', label: t('settings.tabs.events') },
  { key: 'users', label: t('settings.tabs.users') },
])

const activeComponent = computed(() => {
  switch (currentTab.value) {
    case 'cashRegister':
      return SettingsCashRegister
    case 'items':
      return SettingsItems
    case 'cashiers':
      return SettingsCashiers
    case 'events':
      return SettingsEvents
    case 'users':
      return SettingsUsers
    case 'general':
    default:
      return SettingsGeneral
  }
})

const tabKeys = tabs.value.map(tab => tab.key)

watch([() => pageMeta.value?.tab, () => pageMeta.value?.resetTabKey], ([requestedTab, resetTabKey]) => {
  const requested = requestedTab as SettingsTab | undefined
  if (requested && tabKeys.includes(requested)) {
    currentTab.value = requested
    return
  }

  if (resetTabKey) currentTab.value = 'general'
}, { immediate: true })

watch(currentTab, (tab) => {
  if (pageMeta.value?.tab === tab) return
  setPage('Settings', { tab })
}, { immediate: true })
</script>
