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
      <CommonOfflineNotice v-if="!isOnline && currentTab !== 'general'" variant="unavailable" />
      <component :is="activeComponent" v-else />
    </template>
  </Page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '~/composables/useI18n'
import { usePage } from '~/composables/usePage'
import { useConnectivity } from '~/composables/useConnectivity'
import SettingsGeneral from './settings/General.vue'
import SettingsCashRegister from './settings/CashRegister.vue'
import SettingsItems from './settings/Items.vue'
import SettingsStands from './settings/Stands.vue'
import SettingsItemGroups from './settings/ItemGroups.vue'
import SettingsCashiers from './settings/Cashiers.vue'
import SettingsEvents from './settings/Events.vue'
import SettingsUsers from './settings/Users.vue'
import SettingsGuests from './settings/Guests.vue'
import SettingsAffiliations from './settings/Affiliations.vue'

defineEmits<{
  (e: 'openMenu'): void
}>()

type SettingsTab = 'general' | 'cashRegister' | 'items' | 'stands' | 'itemGroups' | 'cashiers' | 'events' | 'users' | 'guests' | 'affiliations'

const currentTab = useState<SettingsTab>('settings-overview-current-tab', () => 'general')
const { t } = useI18n()
const { pageMeta, setPage } = usePage()
const { isOnline } = useConnectivity()
const { user, hasPermission } = useAuth()

// Guest managers reach Settings too, but only see `general` and `guests`.
const tabs = computed(() => {
  const canManage = hasPermission('cash_register.manage')
  const canManageGuests = hasPermission('cash_register.guest_manage')
  const canManageAffiliations = canManage && user.value?.kind !== 'guest'

  return [
    { key: 'general', label: t('settings.tabs.general'), visible: true },
    { key: 'cashRegister', label: t('settings.tabs.cashRegister'), visible: canManage },
    { key: 'items', label: t('settings.tabs.items'), visible: canManage },
    { key: 'stands', label: t('settings.tabs.stands'), visible: canManage },
    { key: 'itemGroups', label: t('settings.tabs.itemGroups'), visible: canManage },
    { key: 'cashiers', label: t('settings.tabs.cashiers'), visible: canManage },
    { key: 'events', label: t('settings.tabs.events'), visible: canManage },
    { key: 'users', label: t('settings.tabs.users'), visible: canManage },
    { key: 'guests', label: t('settings.tabs.guests'), visible: canManageGuests },
    { key: 'affiliations', label: t('settings.tabs.affiliations'), visible: canManageAffiliations },
  ]
    .filter(tab => tab.visible)
    .map(({ key, label }) => ({ key, label }))
})

const tabKeys = computed(() => tabs.value.map(tab => tab.key))

const activeComponent = computed(() => {
  if (!tabKeys.value.includes(currentTab.value)) return SettingsGeneral

  switch (currentTab.value) {
    case 'cashRegister':
      return SettingsCashRegister
    case 'items':
      return SettingsItems
    case 'stands':
      return SettingsStands
    case 'itemGroups':
      return SettingsItemGroups
    case 'cashiers':
      return SettingsCashiers
    case 'events':
      return SettingsEvents
    case 'users':
      return SettingsUsers
    case 'guests':
      return SettingsGuests
    case 'affiliations':
      return SettingsAffiliations
    case 'general':
    default:
      return SettingsGeneral
  }
})

watch([() => pageMeta.value?.tab, () => pageMeta.value?.resetTabKey, tabKeys], ([requestedTab, resetTabKey]) => {
  const requested = requestedTab as SettingsTab | undefined
  if (requested && tabKeys.value.includes(requested)) {
    currentTab.value = requested
    return
  }

  if (resetTabKey || !tabKeys.value.includes(currentTab.value)) currentTab.value = 'general'
}, { immediate: true })

watch(currentTab, (tab) => {
  if (pageMeta.value?.tab === tab) return
  setPage('Settings', { tab })
}, { immediate: true })
</script>
