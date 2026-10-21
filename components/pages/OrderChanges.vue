<template>
  <Page :headline1="t('orderChanges.title')" flush-header-with-cards @open-menu="$emit('openMenu')">
    <template #header="{ headerContainerRef, headlineGroupRef }">
      <CommonTabOverview
        v-model="currentTab"
        :tabs="tabs"
        :header-container-ref="headerContainerRef"
        :headline-group-ref="headlineGroupRef"
      />
    </template>

    <template #cards>
      <PagesOrderChangesCardPayments v-if="currentTab === 'cardPayments'" />
      <PagesOrderChangesRequests v-else />
    </template>
  </Page>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import { usePage } from '~/composables/usePage'
import { useCashRegisterSettings } from '~/composables/useCashRegisterSettings'

defineEmits<{
  (e: 'openMenu'): void
}>()

type OrderChangesTab = 'requests' | 'cardPayments'

const { t } = useI18n()
const { pageMeta, setPage } = usePage()
const { cardConfigured, loaded: settingsLoaded, loadSettings } = useCashRegisterSettings()

const currentTab = useState<OrderChangesTab>('order-changes-current-tab', () => 'requests')

// Card payments only exist with SumUp set up; a single tab hides the tab bar.
const tabs = computed(() => [
  { key: 'requests', label: t('orderChanges.tabs.requests') },
  ...(cardConfigured.value || !settingsLoaded.value ? [{ key: 'cardPayments', label: t('orderChanges.tabs.cardPayments') }] : []),
])
const tabKeys = computed(() => tabs.value.map(tab => tab.key))

onMounted(() => loadSettings())

watch([() => pageMeta.value?.tab, tabKeys], ([requestedTab]) => {
  const requested = requestedTab as OrderChangesTab | undefined
  if (requested && tabKeys.value.includes(requested)) {
    currentTab.value = requested
    return
  }
  if (!tabKeys.value.includes(currentTab.value)) currentTab.value = 'requests'
}, { immediate: true })

watch(currentTab, (tab) => {
  if (pageMeta.value?.tab === tab) return
  setPage('OrderChanges', { tab })
}, { immediate: true })
</script>
